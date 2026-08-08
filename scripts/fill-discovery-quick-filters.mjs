#!/usr/bin/env node
/**
 * Fill quick_filters (Sci-Fi / Light / Shadow tokens) on film_discovery_candidates.
 * Uses the same closed vocabulary as films.quick_filters.
 * Does not touch films, synopsis, moods, aesthetic_tags, or technique.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/fill-discovery-quick-filters.mjs --source manual_seed --dry-run
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/fill-discovery-quick-filters.mjs --source manual_seed --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  buildQuickFiltersPromptSection,
  normalizeDiscoveryQuickFilters,
} from "../lib/film-discovery-quick-filters.mjs";
import { parseJsonFromModelText } from "../lib/film-discovery-workflow.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELECT =
  "id, title, original_title, year, directors, countries, synopsis, the_mood, technique, moods, aesthetic_tags, quick_filters, source";

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

function buildPrompt(row) {
  return `
You assign public catalog quick_filters tokens for one animated feature.

${buildQuickFiltersPromptSection()}

Film:
Title: ${row.title}
Year: ${row.year ?? ""}
Technique: ${row.technique ?? ""}
Moods: ${(row.moods ?? []).join(", ")}
Aesthetic tags: ${(row.aesthetic_tags ?? []).join(", ")}
Synopsis: ${row.synopsis ?? ""}
The mood: ${row.the_mood ?? ""}

Return only JSON:
{
  "quick_filters": [],
  "notes": "optional short note"
}
`.trim();
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
    rows = rows.filter(
      (row) => !Array.isArray(row.quick_filters) || row.quick_filters.length === 0
    );
  }

  /** @type {object[]} */
  const results = [];
  let updated = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    console.error(`[${index + 1}/${rows.length}] ${row.title}`);

    let quickFilters = [];
    let modelError = null;
    let notes = null;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You assign only sci-fi / connection / distance quick_filters using the existing Resonale catalog contract. Return JSON only.",
          },
          { role: "user", content: buildPrompt(row) },
        ],
      });
      const parsed = parseJsonFromModelText(
        response.choices?.[0]?.message?.content
      );
      quickFilters = normalizeDiscoveryQuickFilters(parsed?.quick_filters);
      notes = parsed?.notes ?? null;
    } catch (err) {
      modelError = err instanceof Error ? err.message : String(err);
    }

    let wrote = false;
    // Empty array is a valid write (middle tone, no sci-fi).
    if (options.write && !modelError) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({
          quick_filters: quickFilters,
          content_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
      wrote = true;
      updated += 1;
    }

    results.push({
      id: row.id,
      title: row.title,
      before: row.quick_filters ?? [],
      after: quickFilters,
      notes,
      wrote,
      model_error: modelError,
    });
  }

  const report = {
    dry_run: !options.write,
    write: options.write,
    source: options.source,
    count: results.length,
    candidates_updated: updated,
    database_mutated: options.write && updated > 0,
    writes_to_films_table: false,
    fields_updated: options.write ? ["quick_filters", "content_updated_at"] : [],
    results,
  };

  const outPath =
    options.out ||
    path.join(
      ROOT,
      "tmp",
      options.write
        ? `discovery-quick-filters-write-${results.length}.json`
        : `discovery-quick-filters-dry-run-${results.length}.json`
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        out: outPath,
        candidates_updated: updated,
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
