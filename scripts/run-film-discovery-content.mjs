#!/usr/bin/env node
/**
 * Content curator + reviewer for film_discovery_candidates.
 * Does not write films, publish, change review_status/media_status, or send email.
 *
 * Technique: Wikipedia/source research first; AI last-resort inference is ON by
 * default when OpenAI is available (--skip-ai-technique to disable).
 * Optional --with-web-search for Cartoon Brew / Animation Magazine site search.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/run-film-discovery-content.mjs --dry-run --source manual_seed
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted node scripts/run-film-discovery-content.mjs --source manual_seed
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  isContentResumeEligible,
  runDiscoveryContentBatch,
} from "../lib/film-discovery-content.mjs";
import { DISCOVERY_CONTENT_STATUS } from "../lib/film-discovery.mjs";
import { createTechniqueWebSearchState } from "../lib/film-discovery-technique-web-search.mjs";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    source: null,
    limit: null,
    candidateId: null,
    enableAiTechnique: true,
    enableWebSearch: false,
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
    } else if (arg === "--skip-ai-technique") {
      options.enableAiTechnique = false;
    } else if (arg === "--with-web-search") {
      options.enableWebSearch = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  return options;
}

const CONTENT_SELECT =
  "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, manager_why, researcher_why, source, review_status, eligibility_result, media_status, content_status, synopsis, the_mood, technique, moods, aesthetic_tags, content_note, content_revision_count";

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const tmdbApiKey = process.env.TMDB_API_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is required for Content curator");
  }

  if (!options.dryRun) {
    if (process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
      throw new Error(
        "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 after reviewing dry-run."
      );
    }
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  let query = supabase
    .from("film_discovery_candidates")
    .select(CONTENT_SELECT)
    .order("created_at", { ascending: true });

  if (options.candidateId) query = query.eq("id", options.candidateId);
  if (options.source) query = query.eq("source", options.source);

  let { data, error } = await query;
  if (error && /content_status|synopsis|the_mood|technique/i.test(error.message)) {
    console.warn(
      "Content columns not present yet (apply migration 20260808). Falling back for dry-run only."
    );
    let fallback = supabase
      .from("film_discovery_candidates")
      .select(
        "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, manager_why, researcher_why, source, review_status, eligibility_result, media_status"
      )
      .order("created_at", { ascending: true });
    if (options.candidateId) fallback = fallback.eq("id", options.candidateId);
    if (options.source) fallback = fallback.eq("source", options.source);
    const retry = await fallback;
    if (retry.error) throw retry.error;
    data = (retry.data ?? []).map((row) => ({
      ...row,
      content_status: DISCOVERY_CONTENT_STATUS.pending,
      eligibility_result: row.eligibility_result ?? "PASS",
      synopsis: null,
      the_mood: null,
      technique: null,
      moods: null,
      content_note: null,
    }));
    error = null;
    if (!options.dryRun) {
      throw new Error(
        "Cannot write content until migration 20260808_film_discovery_candidates_content.sql is applied on hosted."
      );
    }
  }
  if (error) throw error;

  let candidates = data ?? [];
  if (!options.force) {
    candidates = candidates.filter((row) =>
      isContentResumeEligible(row, { force: false })
    );
  }
  if (options.limit) {
    candidates = candidates.slice(0, options.limit);
  }

  const report = await runDiscoveryContentBatch(candidates, {
    dryRun: options.dryRun,
    force: options.force,
    skipEmail: true,
    openai,
    tmdbApiKey,
    enableAiTechnique: options.enableAiTechnique,
    enableWebSearch: options.enableWebSearch,
    webSearchState: options.enableWebSearch
      ? createTechniqueWebSearchState()
      : undefined,
    // Use batch default curateFn so Wikipedia run-cache/budget is shared.
    updateFn: async (id, patch) => {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update(patch)
        .eq("id", id);
      if (updateError) throw updateError;
    },
  });

  const examples = report.results.filter((row) => !row.skipped && row.synopsis);
  const pass = report.results.filter(
    (row) => row.diagnostics?.reviewer_branch === "PASS"
  );
  const passWithNote = report.results.filter(
    (row) => row.diagnostics?.reviewer_branch === "PASS_WITH_NOTE"
  );
  const fix = report.results.filter(
    (row) => row.diagnostics?.reviewer_branch === "FIX"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: report.dryRun,
        databaseMutated: report.databaseMutated,
        writes_to_films_table: report.writes_to_films_table,
        review_status_unchanged: report.review_status_unchanged,
        media_status_unchanged: report.media_status_unchanged,
        email_sent: report.email_sent,
        style_guide_version: report.style_guide_version,
        mood_guide_version: report.mood_guide_version,
        tallies: report.tallies,
        batch_audit: report.batch_audit ?? null,
        arithmetic_check: report.arithmetic_check,
        unknown_technique_details: report.unknown_technique_details,
        results: report.results,
        spotlight: {
          pass_samples: pass.slice(0, 2),
          pass_with_note_samples: passWithNote.slice(0, 2),
          fix_all: fix,
          ready_with_note: examples
            .filter(
              (row) =>
                row.content_status === DISCOVERY_CONTENT_STATUS.readyWithNote
            )
            .slice(0, 3),
        },
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
