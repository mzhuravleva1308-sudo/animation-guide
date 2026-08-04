#!/usr/bin/env node
/**
 * Enqueue films from a validated import-batch JSON into film_import_queue.
 *
 * Dedupes against active queue rows (pending/processing) by queue_key
 * (normalized title + year) and tmdb_id when present. Re-running the same
 * file is safe: duplicates are skipped_already_queued.
 *
 * Usage:
 *   APP_ENV=hosted npm run films:enqueue -- --file path/to/batch.json
 *   APP_ENV=hosted npm run films:enqueue -- --file path.json --dry-run
 *   APP_ENV=hosted npm run films:enqueue -- --file path.json --replace-active
 */

import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { validateFile } from "./validate-film-import-batch.mjs";
import {
  buildFilmImportQueueRow,
  enqueueFilmImportBatch,
  formatEnqueueSummary,
} from "../lib/film-import-enqueue.mjs";

function parseArgs(argv) {
  const options = {
    file: null,
    dryRun: false,
    replaceActive: false,
    skipCatalogAdvisory: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") {
      options.file = argv[++index];
    } else if (arg.startsWith("--file=")) {
      options.file = arg.slice("--file=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--replace-active") {
      // Update payload on an existing pending/processing row (corrected JSON).
      options.replaceActive = true;
    } else if (arg === "--skip-catalog-advisory") {
      options.skipCatalogAdvisory = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.file) throw new Error("Pass --file <path>");
  return options;
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const validation = await validateFile(options.file);
  for (const message of validation.warningMessages ?? []) {
    console.warn(message);
  }
  if (validation.errors.length) {
    throw new Error(
      `Invalid film import batch:\n${validation.messages
        .map((message) => `- ${message}`)
        .join("\n")}`
    );
  }

  const films = validation.data.films;
  const baseOrder = Date.now();

  console.log(
    `Enqueue plan: ${films.length} film(s) from batch "${validation.data.batch_name}"`
  );
  for (let index = 0; index < films.length; index += 1) {
    const row = buildFilmImportQueueRow(films[index], { baseOrder, index });
    console.log(
      `- ${row.title} (${row.year}) queue_key=${row.queue_key} sort_order=${row.sort_order}`
    );
  }

  if (options.dryRun) {
    console.log("Dry-run: no rows written.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(url, key);
  const outcome = await enqueueFilmImportBatch({
    supabase,
    batch: validation.data,
    options: {
      baseOrder,
      replaceActive: options.replaceActive,
      skipCatalogAdvisory: options.skipCatalogAdvisory,
    },
  });

  process.stdout.write(
    formatEnqueueSummary(outcome.results, outcome.batchName).text
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      `enqueue-film-import failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  });
}

export { parseArgs };
