import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  parseFilmFestivalRecognitionImportPayload,
  resolveFilmIdForFestivalImportEntry,
  upsertFilmFestivalRecognitions,
} from "../lib/film-festival-recognition.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * @param {string[]} args
 */
function parseArgs(args) {
  const fileArgIndex = args.indexOf("--file");
  const dryRun = args.includes("--dry-run");

  if (fileArgIndex === -1 || !args[fileArgIndex + 1]) {
    throw new Error(
      "Usage: node scripts/import-film-festival-recognitions.mjs --file path/to/payload.json [--dry-run]"
    );
  }

  return {
    filePath: args[fileArgIndex + 1],
    dryRun,
  };
}

async function main() {
  const { filePath, dryRun } = parseArgs(process.argv.slice(2));
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  const payload = JSON.parse(raw);
  const parsed = parseFilmFestivalRecognitionImportPayload(payload);

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  let importedCount = 0;
  let skippedCount = 0;

  for (const [index, entry] of parsed.value.entries()) {
    const filmId = await resolveFilmIdForFestivalImportEntry(supabase, entry);

    if (!filmId) {
      skippedCount += 1;
      console.warn(
        `[skip] entry ${index}: could not resolve film for ${
          entry.film_id ??
          `${entry.film_match?.title ?? "unknown"} (${entry.film_match?.year ?? "?"})`
        }`
      );
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] would upsert ${entry.recognitions.length} recognition(s) for film ${filmId}`
      );
      importedCount += entry.recognitions.length;
      continue;
    }

    const rows = await upsertFilmFestivalRecognitions(
      supabase,
      filmId,
      entry.recognitions
    );

    importedCount += rows.length;
    console.log(
      `Upserted ${rows.length} recognition(s) for film ${filmId} from entry ${index}`
    );
  }

  console.log(
    `Done. ${importedCount} recognition row(s) processed, ${skippedCount} entr${
      skippedCount === 1 ? "y" : "ies"
    } skipped.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
