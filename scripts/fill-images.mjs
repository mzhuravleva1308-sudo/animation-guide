import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

if (!TMDB_API_KEY) {
  throw new Error("Missing TMDB_API_KEY");
}

function normalizeTitle(value) {
  return (value ?? "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/^a\s+/, "")
    .replace(/^an\s+/, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getYearFromDate(date) {
  if (!date) return null;
  return Number(date.slice(0, 4));
}

function getTitleSimilarity(a, b) {
  const normalizedA = normalizeTitle(a);
  const normalizedB = normalizeTitle(b);

  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 100;

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 70;
  }

  const wordsA = new Set(normalizedA.split(" "));
  const wordsB = new Set(normalizedB.split(" "));
  const sharedWords = [...wordsA].filter((word) => wordsB.has(word));

  return (sharedWords.length / Math.max(wordsA.size, wordsB.size)) * 60;
}

function scoreTmdbResult(film, result) {
  const filmYear = film.year;
  const resultYear = getYearFromDate(result.release_date);

  const titleScore = Math.max(
    getTitleSimilarity(film.title, result.title),
    getTitleSimilarity(film.title, result.original_title),
    getTitleSimilarity(film.original_title, result.title),
    getTitleSimilarity(film.original_title, result.original_title)
  );

  const yearScore =
    filmYear && resultYear
      ? filmYear === resultYear
        ? 35
        : Math.abs(filmYear - resultYear) === 1
          ? 15
          : -40
      : 0;

  const posterScore = result.poster_path ? 10 : -20;

  return titleScore + yearScore + posterScore;
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

  const scoredResults = uniqueResults
    .map((result) => ({
      result,
      score: scoreTmdbResult(film, result),
    }))
    .filter((item) => item.result.poster_path)
    .sort((a, b) => b.score - a.score);

  const bestMatch = scoredResults[0];

  if (!bestMatch || bestMatch.score < 80) {
    console.log(
      `Skipped: ${film.title} (${film.year}) — no confident poster match`
    );
    return null;
  }

  return bestMatch.result;
}

async function main() {
  const { data: films, error } = await supabase
    .from("films")
    .select("id, title, original_title, year, image_url")
    .is("image_url", null);

  if (error) {
    throw error;
  }

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
        `Saved poster: ${film.title} (${film.year}) → ${match.title} (${getYearFromDate(
          match.release_date
        )})`
      );
    } catch (error) {
      console.log(`Failed: ${film.title}`, error.message);
    }
  }
}

main();