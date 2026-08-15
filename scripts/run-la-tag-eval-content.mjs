#!/usr/bin/env node
/**
 * Content dry-run for a fixed candidate id list (LA tag eval).
 * Never writes films. With --dry-run never mutates candidates either.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/run-la-tag-eval-content.mjs --ids-file tmp/la-tag-eval-50-ids.json --dry-run
 */

import fs from "node:fs/promises";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { runDiscoveryContentBatch } from "../lib/film-discovery-content.mjs";
import { DISCOVERY_CONTENT_STATUS } from "../lib/film-discovery.mjs";

function parseArgs(argv) {
  const options = { idsFile: null, dryRun: false, force: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ids-file") options.idsFile = argv[++index];
    else if (arg.startsWith("--ids-file=")) options.idsFile = arg.slice("--ids-file=".length);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.idsFile) throw new Error("--ids-file is required");
  return options;
}

const CONTENT_SELECT =
  "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, manager_why, researcher_why, source, review_status, eligibility_result, media_status, content_status, synopsis, the_mood, technique, moods, aesthetic_tags, quick_filters, content_note, content_revision_count";

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(options.idsFile, "utf8"));
  const ids = payload.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("ids-file must contain a non-empty ids array");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!url || !key) throw new Error("Supabase env required");
  if (!openaiKey) throw new Error("OPENAI_API_KEY required");

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

  const { data, error } = await supabase
    .from("film_discovery_candidates")
    .select(CONTENT_SELECT)
    .in("id", ids);
  if (error) throw error;

  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  const candidates = ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`Candidate not found: ${id}`);
    return {
      ...row,
      content_status: row.content_status ?? DISCOVERY_CONTENT_STATUS.pending,
      eligibility_result: row.eligibility_result,
    };
  });

  console.error(`LA tag eval content: ${candidates.length} candidates, dryRun=${options.dryRun}`);

  const report = await runDiscoveryContentBatch(candidates, {
    dryRun: options.dryRun,
    force: options.force,
    skipEmail: true,
    openai,
    tmdbApiKey: process.env.TMDB_API_KEY,
    enableAiTechnique: true,
    enableWebSearch: false,
    updateFn: async (id, patch) => {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update(patch)
        .eq("id", id);
      if (updateError) throw updateError;
    },
  });

  const out = {
    ok: true,
    experiment: "la_tag_eval_50",
    dryRun: report.dryRun,
    databaseMutated: report.databaseMutated,
    writes_to_films_table: report.writes_to_films_table ?? false,
    candidate_count: candidates.length,
    ...report,
  };

  await fs.writeFile("tmp/la-content-dry-run-50.json", JSON.stringify(out, null, 2));
  console.error(`Wrote tmp/la-content-dry-run-50.json (${report.results?.length ?? 0} results)`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: report.dryRun,
        databaseMutated: report.databaseMutated,
        writes_to_films_table: false,
        candidate_count: candidates.length,
        result_count: report.results?.length ?? 0,
        output: "tmp/la-content-dry-run-50.json",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
