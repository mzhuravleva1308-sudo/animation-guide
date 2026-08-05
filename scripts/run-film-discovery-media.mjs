#!/usr/bin/env node
/**
 * Media-only curator for film_discovery_candidates.
 * Does not run Manager/Researcher/Eligibility. Does not write films,
 * publish, enrich synopsis/mood, or change review_status.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/run-film-discovery-media.mjs --dry-run --source manual_seed
 *   WEEKLY_FILM_DISCOVERY_MEDIA_CONFIRM=1 APP_ENV=hosted node scripts/run-film-discovery-media.mjs --source manual_seed
 */

import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  curateDiscoveryMedia,
  isMediaResumeEligible,
  runDiscoveryMediaBatch,
} from "../lib/film-discovery-media.mjs";
import { DISCOVERY_MEDIA_STATUS } from "../lib/film-discovery.mjs";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    source: null,
    limit: null,
    candidateId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--source") options.source = argv[++index];
    else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    } else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--candidate-id") options.candidateId = argv[++index];
    else if (arg.startsWith("--candidate-id=")) {
      options.candidateId = arg.slice("--candidate-id=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  return options;
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tmdbApiKey = process.env.TMDB_API_KEY;
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }
  if (!tmdbApiKey) {
    throw new Error("TMDB_API_KEY is required for Media curator");
  }

  if (!options.dryRun) {
    if (process.env.WEEKLY_FILM_DISCOVERY_MEDIA_CONFIRM !== "1") {
      throw new Error(
        "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_MEDIA_CONFIRM=1 after reviewing dry-run."
      );
    }
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, original_title, year, directors, countries, runtime_minutes, source, review_status, eligibility_result, media_status, media_attempts, poster_url, trailer_url"
    )
    .order("created_at", { ascending: true });

  if (options.candidateId) {
    query = query.eq("id", options.candidateId);
  }
  if (options.source) {
    query = query.eq("source", options.source);
  }

  let { data, error } = await query;
  if (error && /media_status|poster_url|trailer_url/i.test(error.message)) {
    console.warn(
      "Media columns not present yet (apply migration 20260807). Falling back to identity fields for dry-run."
    );
    let fallback = supabase
      .from("film_discovery_candidates")
      .select(
        "id, title, original_title, year, directors, countries, runtime_minutes, source, review_status, eligibility_result"
      )
      .order("created_at", { ascending: true });
    if (options.candidateId) fallback = fallback.eq("id", options.candidateId);
    if (options.source) fallback = fallback.eq("source", options.source);
    const retry = await fallback;
    if (retry.error) throw retry.error;
    data = (retry.data ?? []).map((row) => ({
      ...row,
      media_status: "media_pending",
      media_attempts: 0,
      poster_url: null,
      trailer_url: null,
      eligibility_result: row.eligibility_result ?? "PASS",
    }));
    error = null;
    if (!options.dryRun) {
      throw new Error(
        "Cannot write media until migration 20260807_film_discovery_candidates_media.sql is applied on hosted."
      );
    }
  }
  if (error) throw error;

  let candidates = data ?? [];
  if (!options.force) {
    candidates = candidates.filter((row) =>
      isMediaResumeEligible(row, { force: false })
    );
  }
  if (options.limit) {
    candidates = candidates.slice(0, options.limit);
  }

  const report = await runDiscoveryMediaBatch(candidates, {
    dryRun: options.dryRun,
    force: options.force,
    tmdbApiKey,
    youtubeApiKey,
    curateFn: curateDiscoveryMedia,
    updateFn: async (id, patch) => {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update(patch)
        .eq("id", id);
      if (updateError) throw updateError;
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: report.dryRun,
        databaseMutated: report.databaseMutated,
        writes_to_films_table: report.writes_to_films_table,
        review_status_unchanged: report.review_status_unchanged,
        enrich_full: report.enrich_full,
        publish: report.publish,
        tallies: report.tallies,
        sample: report.results.slice(0, 5),
        media_complete_example: report.results.find(
          (row) => row.media_status === DISCOVERY_MEDIA_STATUS.complete
        ),
        media_partial_example: report.results.find(
          (row) => row.media_status === DISCOVERY_MEDIA_STATUS.partial
        ),
        media_failed_example: report.results.find(
          (row) => row.media_status === DISCOVERY_MEDIA_STATUS.failed
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
