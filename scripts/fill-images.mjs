import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";
import {
  evaluateTmdbMatch,
  fetchTmdbMovieDetails,
} from "../lib/tmdb-film-matching.mjs";

applyAppEnv();

const scope = parseFilmScopeArgs(process.argv.slice(2));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

if (!TMDB_API_KEY) {
  throw new Error("Missing TMDB_API_KEY");
}

async function searchTmdb(query, year) {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    query,
    include_adult: "false",
  });

  if (year) {
    params.set("year", String(year));
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/search/movie?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.status}`);
  }

  const data = await response.json();
  return data.results ?? [];
}

async function findBestTmdbMatch(film) {
  const queries = [film.title, film.original_title].filter(Boolean);

  const allResults = [];

  for (const query of queries) {
    const resultsWithYear = await searchTmdb(query, film.year);
    allResults.push(...resultsWithYear);

    if (resultsWithYear.length === 0) {
      const resultsWithoutYear = await searchTmdb(query);
      allResults.push(...resultsWithoutYear);
    }
  }

  const uniqueResults = Array.from(
    new Map(allResults.map((result) => [result.id, result])).values()
  );

  const evaluatedResults = [];
  for (const result of uniqueResults.slice(0, 10)) {
    const details = await fetchTmdbMovieDetails(TMDB_API_KEY, result.id);
    const evaluation = evaluateTmdbMatch(film, {
      ...result,
      ...details,
    });
    evaluatedResults.push({ result: { ...result, ...details }, evaluation });
  }

  evaluatedResults.sort((a, b) => {
    const titleDifference =
      b.evaluation.evidence.titleSimilarity -
      a.evaluation.evidence.titleSimilarity;
    if (titleDifference !== 0) {
      return titleDifference;
    }

    const signalDifference =
      b.evaluation.evidence.signalCount -
      a.evaluation.evidence.signalCount;
    if (signalDifference !== 0) {
      return signalDifference;
    }

    return (
      (a.evaluation.evidence.yearDifference ?? Number.POSITIVE_INFINITY) -
      (b.evaluation.evidence.yearDifference ?? Number.POSITIVE_INFINITY)
    );
  });

  const bestMatch = evaluatedResults.find(
    (item) => item.evaluation.accepted && item.result.poster_path
  );

  if (!bestMatch) {
    console.log(
      `Skipped: ${film.title} (${film.year}) — no confident poster match`
    );

    for (const item of evaluatedResults.slice(0, 5)) {
      console.log(
        `  Candidate ${item.result.title} (${item.result.release_date?.slice(
          0,
          4
        ) ?? "unknown"}): ${item.evaluation.reason}`
      );
    }

    return null;
  }

  console.log(
    `  Match ${bestMatch.result.title} (${bestMatch.result.release_date?.slice(
      0,
      4
    ) ?? "unknown"}): ${bestMatch.evaluation.reason}`
  );
  return bestMatch.result;
}

async function main() {
  const films = await loadScopedFilms(supabase, scope, {
    select:
      "id, title, original_title, director, country, synopsis, year, image_url",
    applyFilters: (query) => query.is("image_url", null),
  });

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(`Films without image: ${films.length}`);

  for (const film of films) {
    try {
      const match = await findBestTmdbMatch(film);

      if (!match?.poster_path) {
        continue;
      }

      const imageUrl = `${TMDB_IMAGE_BASE_URL}${match.poster_path}`;

      const { error: updateError } = await supabase
        .from("films")
        .update({ image_url: imageUrl })
        .eq("id", film.id);

      if (updateError) {
        console.log(`Update failed: ${film.title}`, updateError.message);
        continue;
      }

      console.log(
        `Saved poster: ${film.title} (${film.year}) → ${match.title} (${
          match.release_date?.slice(0, 4) ?? "unknown"
        })`
      );
    } catch (error) {
      console.log(`Failed: ${film.title}`, error.message);
    }
  }
}

main();