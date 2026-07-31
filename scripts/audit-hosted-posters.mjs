/**
 * Read-only hosted poster audit.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/audit-hosted-posters.mjs
 *   npm run hosted:audit-posters
 */
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { auditFilmPosters } from "../lib/audit-film-posters.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("films")
    .select("id, title, poster_url")
    .order("title");

  if (error) {
    throw error;
  }

  const report = await auditFilmPosters(data ?? [], supabaseUrl);
  const ok =
    report.missingPosterUrl === 0 &&
    report.externalPosterUrl === 0 &&
    report.brokenStoragePoster === 0 &&
    report.validCachedPosters === report.total &&
    report.total > 0;

  console.log(
    JSON.stringify(
      {
        ok,
        total: report.total,
        validCachedPosters: report.validCachedPosters,
        missingPosterUrl: report.missingPosterUrl,
        externalPosterUrl: report.externalPosterUrl,
        brokenStoragePoster: report.brokenStoragePoster,
        issues: report.issues,
      },
      null,
      2
    )
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
