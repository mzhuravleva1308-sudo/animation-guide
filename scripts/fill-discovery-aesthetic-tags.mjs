#!/usr/bin/env node
/**
 * Fill aesthetic_tags (material tags) on film_discovery_candidates.
 * Does not touch films, synopsis, the_mood, moods, or technique.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/fill-discovery-aesthetic-tags.mjs --source manual_seed --dry-run
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/fill-discovery-aesthetic-tags.mjs --source manual_seed --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  buildAestheticTagsOnlyPrompt,
  normalizeAestheticTags,
} from "../lib/film-discovery-aesthetic-tags.mjs";
import { parseJsonFromModelText } from "../lib/film-discovery-workflow.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELECT =
  "id, title, original_title, year, directors, countries, synopsis, the_mood, technique, moods, aesthetic_tags, source";

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
      (row) => !Array.isArray(row.aesthetic_tags) || row.aesthetic_tags.length === 0
    );
  }

  /** @type {object[]} */
  const results = [];
  let updated = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    console.error(`[${index + 1}/${rows.length}] ${row.title}`);

    let aestheticTags = [];
    let modelError = null;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You create precise aesthetic/material feeling tags for animated films. Return JSON only.",
          },
          { role: "user", content: buildAestheticTagsOnlyPrompt(row) },
        ],
      });
      const parsed = parseJsonFromModelText(
        response.choices?.[0]?.message?.content
      );
      aestheticTags = normalizeAestheticTags(parsed?.aesthetic_tags);
    } catch (err) {
      modelError = err instanceof Error ? err.message : String(err);
    }

    let wrote = false;
    if (options.write && aestheticTags.length && !modelError) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({
          aesthetic_tags: aestheticTags,
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
      before: row.aesthetic_tags ?? [],
      after: aestheticTags,
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
    fields_updated: options.write
      ? ["aesthetic_tags", "content_updated_at"]
      : [],
    moods_unchanged: true,
    technique_unchanged: true,
    synopsis_unchanged: true,
    results,
  };

  const outPath =
    options.out ||
    path.join(
      ROOT,
      "tmp",
      options.write
        ? `discovery-aesthetic-tags-write-${results.length}.json`
        : `discovery-aesthetic-tags-dry-run-${results.length}.json`
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
