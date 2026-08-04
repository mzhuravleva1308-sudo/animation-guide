#!/usr/bin/env node
/**
 * Import minimal discovery candidates into film_discovery_candidates.
 * Never writes public.films, never enriches, never publishes.
 *
 * Usage:
 *   node scripts/import-film-discovery-candidates.mjs --file path/to/batch.json --dry-run
 *   APP_ENV=hosted node scripts/import-film-discovery-candidates.mjs --file path/to/batch.json
 *
 * Hosted writes require WEEKLY_FILM_DISCOVERY_SEED_CONFIRM=1.
 */

import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  loadMinimalDiscoverySchema,
  runMinimalDiscoveryImport,
} from "../lib/film-discovery-minimal-import.mjs";

function parseArgs(argv) {
  const options = { file: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") options.file = argv[++index];
    else if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error("--file is required");
  return options;
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const schema = await loadMinimalDiscoverySchema();
  const batch = JSON.parse(await fs.readFile(options.file, "utf8"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  /** @type {object[]} */
  let catalogFilms = [];
  /** @type {object[]} */
  let existingCandidates = [];
  /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
  let supabase = null;

  if (url && key) {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: films } = await supabase
      .from("films")
      .select("id, title, original_title, year, normalized_title, normalized_original_title");
    catalogFilms = films ?? [];
    const { data: candidates } = await supabase
      .from("film_discovery_candidates")
      .select(
        "id, title, original_title, year, review_status, normalized_title, normalized_original_title"
      );
    existingCandidates = candidates ?? [];
  } else if (!options.dryRun) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for non-dry-run"
    );
  } else {
    console.warn(
      "No Supabase env — dry-run duplicate check against catalog/candidates skipped."
    );
  }

  if (!options.dryRun) {
    if (process.env.WEEKLY_FILM_DISCOVERY_SEED_CONFIRM !== "1") {
      throw new Error(
        "Refusing hosted/local write. Re-run with WEEKLY_FILM_DISCOVERY_SEED_CONFIRM=1 after reviewing the dry-run report."
      );
    }
  }

  const result = await runMinimalDiscoveryImport({
    batch,
    schema,
    catalogFilms,
    existingCandidates,
    dryRun: options.dryRun,
    insertFn: async (rows) => {
      if (!supabase) throw new Error("Supabase client missing");
      const { error } = await supabase
        .from("film_discovery_candidates")
        .insert(rows);
      if (error) throw error;
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        dryRun: result.dryRun,
        databaseMutated: result.databaseMutated,
        validation_errors: result.validation.errors,
        film_count: result.validation.filmCount,
        would_insert: result.plan?.would_insert ?? 0,
        skipped_duplicates: result.plan?.skipped_duplicates ?? [],
        writes_to_films_table: result.plan?.writes_to_films_table ?? false,
        sample_rows: (result.plan?.rows ?? []).slice(0, 3).map((row) => ({
          title: row.title,
          original_title: row.original_title,
          year: row.year,
          directors: row.directors,
          countries: row.countries,
          runtime_minutes: row.runtime_minutes,
          review_status: row.review_status,
          source: row.source,
        })),
      },
      null,
      2
    )
  );

  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
