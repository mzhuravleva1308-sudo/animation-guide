#!/usr/bin/env node
/**
 * Fill festival_recognitions on film_discovery_candidates via AI winners.
 * Does not touch films or film_festival_recognitions.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/fill-discovery-festivals.mjs --source manual_seed --dry-run
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/fill-discovery-festivals.mjs --source manual_seed --write --force
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  extractDiscoveryFestivalRecognitions,
  formatDiscoveryFestivalLabels,
} from "../lib/film-discovery-festivals.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELECT =
  "id, title, original_title, year, directors, countries, festival_recognitions, source";

function parseArgs(argv) {
  const options = {
    source: "manual_seed",
    limit: null,
    write: false,
    force: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") options.source = argv[++i];
    else if (arg.startsWith("--source=")) options.source = arg.slice(9);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else if (arg === "--write") options.write = true;
    else if (arg === "--dry-run") options.write = false;
    else if (arg === "--force") options.force = true;
    else if (arg === "--out") options.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  return options;
}

function hasRecognitions(value) {
  return Array.isArray(value) && value.length > 0;
}

async function main() {
  applyAppEnv({ mode: "hosted" });
  const options = parseArgs(process.argv.slice(2));

  if (options.write && process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 --write"
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!url || !key) throw new Error("Supabase env required");
  if (!openaiKey) throw new Error("OPENAI_API_KEY required");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  let query = supabase
    .from("film_discovery_candidates")
    .select(SELECT)
    .eq("source", options.source)
    .order("title", { ascending: true });
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;

  let rows = data ?? [];
  if (!options.force) {
    rows = rows.filter((row) => !hasRecognitions(row.festival_recognitions));
  }

  /** @type {object[]} */
  const results = [];
  let updated = 0;
  let withAwards = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    console.error(`[${index + 1}/${rows.length}] ${row.title}`);

    let recognitions = [];
    let modelError = null;
    try {
      const extracted = await extractDiscoveryFestivalRecognitions(openai, row);
      if (!extracted.ok) {
        modelError = extracted.error;
      } else {
        recognitions = extracted.recognitions;
      }
    } catch (err) {
      modelError = err instanceof Error ? err.message : String(err);
    }

    if (recognitions.length) withAwards += 1;

    let wrote = false;
    if (options.write && !modelError) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({
          festival_recognitions: recognitions,
          content_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
      wrote = true;
      updated += 1;
    }

    const labels = formatDiscoveryFestivalLabels(recognitions);
    console.error(
      labels.length
        ? `  awards: ${labels.join("; ")}`
        : modelError
          ? `  error: ${modelError}`
          : "  awards: (none)"
    );

    results.push({
      id: row.id,
      title: row.title,
      before: row.festival_recognitions ?? [],
      after: recognitions,
      labels,
      wrote,
      model_error: modelError,
    });
  }

  const report = {
    dry_run: !options.write,
    write: options.write,
    source: options.source,
    count: results.length,
    films_with_awards: withAwards,
    candidates_updated: updated,
    database_mutated: options.write && updated > 0,
    writes_to_films_table: false,
    writes_to_film_festival_recognitions: false,
    fields_updated: options.write
      ? ["festival_recognitions", "content_updated_at"]
      : [],
    results,
  };

  const outPath =
    options.out ||
    path.join(
      ROOT,
      "tmp",
      options.write
        ? `discovery-festivals-hosted-write-${results.length}.json`
        : `discovery-festivals-dry-run-${results.length}.json`
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        out: outPath,
        candidates_updated: updated,
        films_with_awards: withAwards,
        database_mutated: report.database_mutated,
        writes_to_films_table: false,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
