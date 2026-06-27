import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";

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
const TMDB_ANIMATION_GENRE_ID = 16;

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
  return Number(String(date).slice(0, 4));
}

function isAnimationResult(result) {
  return result.genre_ids?.includes(TMDB_ANIMATION_GENRE_ID);
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
  const filmYear = Number(film.year);
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
          ? 10
          : -80
      : 0;

  const animationScore = isAnimationResult(result) ? 40 : -100;

  return titleScore + yearScore + animationScore;
}

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

  const scoredResults = uniqueResults
    .map((result) => ({
      result,
      score: scoreTmdbResult(film, result),
    }))
    .filter((item) => isAnimationResult(item.result))
    .sort((a, b) => b.score - a.score);

  const bestMatch = scoredResults[0];

  if (!bestMatch || bestMatch.score < 100) {
    console.log(
      `Skipped TMDB movie: ${film.title} (${film.year}) — no confident animation match`
    );

    console.log(
      scoredResults.slice(0, 5).map((item) => ({
        title: item.result.title,
        original_title: item.result.original_title,
        year: getYearFromDate(item.result.release_date),
        score: item.score,
        genre_ids: item.result.genre_ids,
      }))
    );

    return null;
  }

  return bestMatch.result;
}

async function getTrailerUrl(tmdbMovieId) {
  const params = new URLSearchParams({
    api_key: tmdbApiKey,
  });

  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbMovieId}/videos?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`TMDB videos error for movie ${tmdbMovieId}: ${response.status}`);
  }

  const data = await response.json();

  const videos = data.results ?? [];

  const trailer =
    videos.find(
      (video) =>
        video.site === "YouTube" &&
        video.type === "Trailer" &&
        video.official === true
    ) ??
    videos.find(
      (video) => video.site === "YouTube" && video.type === "Trailer"
    ) ??
    videos.find(
      (video) => video.site === "YouTube" && video.type === "Teaser"
    ) ??
    videos.find((video) => video.site === "YouTube");

  if (!trailer?.key) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${trailer.key}`;
}

async function main() {
  const films = await loadScopedFilms(supabase, scope, {
    select: "id,title,original_title,year,trailer_url",
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

      const trailerUrl = await getTrailerUrl(movie.id);

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