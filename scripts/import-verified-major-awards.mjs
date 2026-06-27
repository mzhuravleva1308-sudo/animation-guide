import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import {
  parseFilmFestivalRecognitionImportPayload,
  resolveFilmIdForFestivalImportEntry,
  upsertFilmFestivalRecognitions,
} from "../lib/film-festival-recognition.mjs";

applyAppEnv();

console.log("Starting verified awards import...");
console.log({ filePath: process.argv[2], dryRun: process.argv.includes("--dry-run") });

const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!filePath) {
  console.error(
    "Usage: APP_ENV=hosted node scripts/import-verified-major-awards.mjs <path-to-json> [--dry-run]"
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const raw = await fs.readFile(path.resolve(filePath), "utf8");
const payload = JSON.parse(raw);

const parsed = parseFilmFestivalRecognitionImportPayload(payload);

if (!parsed.ok) {
  console.error(`Invalid import payload: ${parsed.error}`);
  process.exit(1);
}

console.log("Environment loaded, creating Supabase client...");

const supabase = createClient(supabaseUrl, supabaseKey);

let processed = 0;
let saved = 0;
let skipped = 0;
let failed = 0;

for (const [index, entry] of parsed.value.entries()) {
  processed += 1;

  try {
    const filmId = await resolveFilmIdForFestivalImportEntry(supabase, entry);

    if (!filmId) {
      skipped += 1;
      console.warn(`[skip] entry ${index}: film was not resolved`);
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] entry ${index}: ${filmId} — ${entry.recognitions
          .map((recognition) => `${recognition.festival_name}: ${recognition.award_name}`)
          .join("; ")}`
      );
      continue;
    }

    const rows = await upsertFilmFestivalRecognitions(
      supabase,
      filmId,
      entry.recognitions
    );

    saved += rows.length;

    console.log(
      `[saved] entry ${index}: ${rows
        .map((row) => `${row.festival_name}: ${row.award_name}`)
        .join("; ")}`
    );
  } catch (error) {
    failed += 1;
    console.error(
      `[error] entry ${index}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

console.log("\n=== Verified major awards import summary ===");
console.log(`- processed: ${processed}`);
console.log(`- saved: ${saved}`);
console.log(`- skipped: ${skipped}`);
console.log(`- errors: ${failed}`);

if (failed > 0) {
  process.exitCode = 1;
}