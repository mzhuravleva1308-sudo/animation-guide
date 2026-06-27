import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import {
  FILM_POSTERS_BUCKET,
  buildPosterStoragePath,
  buildPublicPosterUrl,
  extensionForContentType,
  getExternalImageSource,
  isCachedPosterUrl,
} from "../lib/film-poster.mjs";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";

applyAppEnv();

const scope = parseFilmScopeArgs(process.argv.slice(2));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const force =
  scope.passthrough.includes("--force") || process.argv.includes("--force");

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function downloadImage(url) {
  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type");
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("Downloaded image was empty");
  }

  return { buffer, contentType };
}

function shouldCacheFilm(film) {
  if (film.poster_url && !force) {
    return false;
  }

  const sourceUrl = getExternalImageSource(film);

  if (!sourceUrl) {
    return false;
  }

  if (isCachedPosterUrl(sourceUrl, supabaseUrl)) {
    return false;
  }

  return true;
}

async function main() {
  const films = await loadScopedFilms(supabase, scope, {
    select: "id, title, image_url, external_image_url, poster_url",
  });

  const toCache = films.filter(shouldCacheFilm);

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(
    `Films to cache: ${toCache.length} (${films.length} total, force=${force})`
  );

  let cached = 0;
  let skipped = films.length - toCache.length;
  const failed = [];

  for (const film of toCache) {
    const sourceUrl = getExternalImageSource(film);

    try {
      const { buffer, contentType } = await downloadImage(sourceUrl);
      const extension = extensionForContentType(contentType);
      const path = buildPosterStoragePath(film.id, extension);

      const { error: uploadError } = await supabase.storage
        .from(FILM_POSTERS_BUCKET)
        .upload(path, buffer, {
          contentType: contentType ?? `image/${extension}`,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const posterUrl = buildPublicPosterUrl(supabaseUrl, film.id, extension);
      const externalImageUrl = film.external_image_url ?? film.image_url;

      const { error: updateError } = await supabase
        .from("films")
        .update({
          poster_url: posterUrl,
          external_image_url: externalImageUrl,
        })
        .eq("id", film.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      cached += 1;
      console.log(`Cached: ${film.title} → ${posterUrl}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ id: film.id, title: film.title, error: message });
      console.log(`Failed: ${film.title} — ${message}`);
    }
  }

  console.log(`\nDone. Cached: ${cached}, Skipped: ${skipped}, Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed films:");
    for (const item of failed) {
      console.log(`  - ${item.title} (${item.id}): ${item.error}`);
    }
    process.exitCode = 1;
  }
}

main();
