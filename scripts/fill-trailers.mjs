import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tmdbApiKey = process.env.TMDB_API_KEY;

if (!supabaseUrl || !supabaseKey || !tmdbApiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or TMDB_API_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function searchTmdbMovie(title, year) {
  const params = new URLSearchParams({
    api_key: tmdbApiKey,
    query: title,
    include_adult: "true",
  });

  if (year) {
    params.set("year", String(year));
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/search/movie?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`TMDB search error for "${title}": ${response.status}`);
  }

  const data = await response.json();

  const withDate = data.results?.filter((result) => result.release_date) ?? [];

  const exactYear = withDate.find((result) =>
    result.release_date?.startsWith(String(year))
  );

  return exactYear ?? data.results?.[0] ?? null;
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
  const { data: films, error } = await supabase
    .from("films")
    .select("id,title,year,trailer_url")
    .is("trailer_url", null);

  if (error) throw error;

  console.log(`Films without trailer: ${films.length}`);

  for (const film of films) {
    try {
      const movie = await searchTmdbMovie(film.title, film.year);

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