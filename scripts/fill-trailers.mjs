import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";
import {
  buildVideoLanguageList,
  evaluateTmdbMatch,
  fetchTmdbMovieDetails,
} from "../lib/tmdb-film-matching.mjs";
import { selectBestTrailerVideo } from "../lib/tmdb-trailer-selection.mjs";

applyAppEnv();

const scope = parseFilmScopeArgs(process.argv.slice(2));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tmdbApiKey = process.env.TMDB_API_KEY;

if (!supabaseUrl || !supabaseKey || !tmdbApiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or TMDB_API_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function searchTmdbMovie(film) {
  const queries = [film.title, film.original_title].filter(Boolean);
  const allResults = [];

  for (const query of queries) {
    const params = new URLSearchParams({
      api_key: tmdbApiKey,
      query,
      include_adult: "false",
    });

    if (film.year) {
      params.set("year", String(film.year));
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`TMDB search error for "${query}": ${response.status}`);
    }

    const data = await response.json();
    allResults.push(...(data.results ?? []));
  }

  const uniqueResults = Array.from(
    new Map(allResults.map((result) => [result.id, result])).values()
  );

  const evaluatedResults = [];
  for (const result of uniqueResults.slice(0, 10)) {
    const details = await fetchTmdbMovieDetails(
      tmdbApiKey,
      result.id,
      "credits"
    );
    evaluatedResults.push({
      result: { ...result, ...details },
      evaluation: evaluateTmdbMatch(film, { ...result, ...details }),
    });
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

  const bestMatch = evaluatedResults.find((item) => item.evaluation.accepted);

  if (!bestMatch) {
    console.log(
      `Skipped TMDB movie: ${film.title} (${film.year}) — no confident animation match`
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

  const videoLanguages = buildVideoLanguageList(
    bestMatch.result.original_language
  );
  console.log(
    `  Video languages for ${film.title}: ${videoLanguages.join(",")}`
  );

  const videoDetails = await fetchTmdbMovieDetails(
    tmdbApiKey,
    bestMatch.result.id,
    "videos",
    { includeVideoLanguage: videoLanguages.join(",") }
  );
  const matchedMovie = { ...bestMatch.result, ...videoDetails };

  console.log(
    `  Match ${bestMatch.result.title} (${bestMatch.result.release_date?.slice(
      0,
      4
    ) ?? "unknown"}): ${bestMatch.evaluation.reason}`
  );

  return matchedMovie;
}

async function resolveYoutubeChannel(video) {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${video.key}`
    )}&format=json`
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.author_name ?? null;
}

async function getTrailerUrl(movie) {
  const selected = await selectBestTrailerVideo(movie, {
    resolveChannel: resolveYoutubeChannel,
  });

  if (!selected?.video?.key) {
    return null;
  }

  console.log(
    `  Video ${selected.video.key}: ${selected.kind}; ${selected.sourceReason}${
      selected.video.channel_name ? `; channel: ${selected.video.channel_name}` : ""
    }`
  );

  return `https://www.youtube.com/watch?v=${selected.video.key}`;
}

async function main() {
  const films = await loadScopedFilms(supabase, scope, {
    select:
      "id,title,original_title,director,country,synopsis,year,trailer_url",
    applyFilters: (query) => query.is("trailer_url", null),
  });

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(`Films without trailer: ${films.length}`);

  for (const film of films) {
    try {
      const movie = await searchTmdbMovie(film);

      if (!movie?.id) {
        console.log(`No TMDB movie found: ${film.title}`);
        continue;
      }

      const trailerUrl = await getTrailerUrl(movie);

      if (!trailerUrl) {
        console.log(`No trailer found: ${film.title}`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("films")
        .update({ trailer_url: trailerUrl })
        .eq("id", film.id);

      if (updateError) {
        console.log(`Update error: ${film.title}: ${updateError.message}`);
        continue;
      }

      console.log(`Saved trailer: ${film.title}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Failed: ${film.title}: ${message}`);
    }
  }
}

main();