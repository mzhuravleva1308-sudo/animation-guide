#!/usr/bin/env node
/**
 * Re-queue a failed (or warning) film_import_queue row for another attempt.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/retry-film-import-queue.mjs --id <uuid>
 *   APP_ENV=hosted node scripts/retry-film-import-queue.mjs --id <uuid> --bump-max-attempts
 */

import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  QUEUE_STATUS,
  buildManualRetryUpdate,
} from "../lib/film-import-queue.mjs";

function parseArgs(argv) {
  const options = { id: null, bumpMaxAttempts: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--id") {
      options.id = argv[++index];
    } else if (arg.startsWith("--id=")) {
      options.id = arg.slice("--id=".length);
    } else if (arg === "--bump-max-attempts") {
      options.bumpMaxAttempts = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.id) throw new Error("Pass --id <queue-uuid>");
  return options;
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(url, key);
  const { data: item, error } = await supabase
    .from("film_import_queue")
    .select("*")
    .eq("id", options.id)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw new Error(`Queue row not found: ${options.id}`);

  const update = buildManualRetryUpdate(item);
  if (options.bumpMaxAttempts) {
    update.max_attempts = Math.max(Number(item.max_attempts) || 1, Number(item.attempts) || 0) + 1;
  } else if ((Number(item.attempts) || 0) >= (Number(item.max_attempts) || 1)) {
    throw new Error(
      `attempts (${item.attempts}) already reached max_attempts (${item.max_attempts}); pass --bump-max-attempts`
    );
  }

  const { data, error: updateError } = await supabase
    .from("film_import_queue")
    .update(update)
    .eq("id", options.id)
    .in("status", [
      QUEUE_STATUS.FAILED,
      QUEUE_STATUS.COMPLETED_WITH_WARNINGS,
    ])
    .select("id,title,status,attempts,max_attempts")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!data) {
    throw new Error(
      `Could not re-queue ${options.id} (status may have changed)`
    );
  }

  console.log(
    `Re-queued ${data.title} (${data.id}) → ${data.status} attempts=${data.attempts}/${data.max_attempts}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      `retry-film-import-queue failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  });
}
