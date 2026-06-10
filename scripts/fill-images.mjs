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
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

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
    throw new Error(`TMDB error for "${title}": ${response.status}`);
  }

  const data = await response.json();
  return data.results?.[0] ?? null;
}

async function main() {
  const { data: films, error } = await supabase
    .from("films")
    .select("id,title,year,image_url")
    .is("image_url", null);

  if (error) throw error;

  console.log(`Films without image: ${films.length}`);

  for (const film of films) {
    try {
      const result = await searchTmdbMovie(film.title, film.year);

      if (!result?.poster_path) {
        console.log(`No poster found: ${film.title} (${film.year ?? "no year"})`);
        continue;
      }

      const imageUrl = `${IMAGE_BASE_URL}${result.poster_path}`;

      const { error: updateError } = await supabase
        .from("films")
        .update({ image_url: imageUrl })
        .eq("id", film.id);

      if (updateError) {
        console.log(`Update error: ${film.title}: ${updateError.message}`);
        continue;
      }

      console.log(`Saved poster: ${film.title}`);
    } catch (err) {
      console.log(`Failed: ${film.title}: ${err.message}`);
    }
  }
}

main();