/**
 * Read-only hosted trailer audit (animation + live-action).
 *
 * Usage:
 *   APP_ENV=hosted node scripts/audit-hosted-trailers.mjs
 *   npm run hosted:audit-trailers
 */
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { auditFilmTrailers } from "../lib/audit-film-trailers.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

if (!youtubeApiKey) {
  throw new Error("Missing YOUTUBE_API_KEY");
}

async function loadAllFilms(supabase) {
  const pageSize = 1000;
  const films = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("films")
      .select(
        "id, title, year, media_type, catalog_visible, trailer_url, trailer_video_id, trailer_source"
      )
      .order("title")
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    films.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return films;
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const films = await loadAllFilms(supabase);
  const report = await auditFilmTrailers(films, { apiKey: youtubeApiKey });

  const visibleBroken = report.broken.filter(
    (row) => row.catalog_visible === true
  );
  const hiddenBroken = report.broken.filter(
    (row) => row.catalog_visible !== true
  );

  console.log(
    JSON.stringify(
      {
        total: report.total,
        withTrailer: report.withTrailer,
        missingTrailer: report.missingTrailer,
        brokenTrailer: report.brokenTrailer,
        brokenVisible: visibleBroken.length,
        brokenHidden: hiddenBroken.length,
        missingByMediaType: report.missingByMediaType,
        brokenByMediaType: report.brokenByMediaType,
        broken: report.broken,
      },
      null,
      2
    )
  );

  if (report.brokenTrailer > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
