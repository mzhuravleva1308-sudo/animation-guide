#!/usr/bin/env node
/**
 * Mood-only comparison / rewrite using Mood Writing Guide.
 * Does not mutate synopsis / technique / moods / films / publish / email.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/run-mood-only-comparison.mjs \
 *     --from-content-report tmp/discovery-content-dry-run-50-v5.json --dry-run
 *
 *   APP_ENV=hosted node scripts/run-mood-only-comparison.mjs \
 *     --from-hosted --source manual_seed --dry-run
 *
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/run-mood-only-comparison.mjs \
 *     --from-hosted --source manual_seed --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  loadMoodWritingGuide,
  MOOD_GUIDE_ID,
} from "../lib/film-mood-writing-guide.mjs";
import { runMoodOnlyComparisonBatch } from "../lib/film-mood-only-rewrite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SPOTLIGHT_TITLES = [
  "Blood Tea and Red String",
  "Fire and Ice",
  "Padak",
  "The Peasants",
  "Black Butterflies",
  "Boys Go to Jupiter",
  "Tehran Taboo",
  "The Weird Kidz",
  "Bubble Bath",
  "Rio 2096: A Story of Love and Fury",
];

function parseArgs(argv) {
  const options = {
    dryRun: true,
    write: false,
    fromContentReport: null,
    fromHosted: false,
    source: null,
    out: null,
    model: "gpt-4.1-mini",
    limit: null,
    titlesFile: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--write") {
      options.write = true;
      options.dryRun = false;
    } else if (arg === "--from-hosted") options.fromHosted = true;
    else if (arg === "--from-content-report") options.fromContentReport = argv[++i];
    else if (arg.startsWith("--from-content-report=")) {
      options.fromContentReport = arg.slice("--from-content-report=".length);
    } else if (arg === "--source") options.source = argv[++i];
    else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    } else if (arg === "--out") options.out = argv[++i];
    else if (arg.startsWith("--out=")) options.out = arg.slice("--out=".length);
    else if (arg === "--model") options.model = argv[++i];
    else if (arg.startsWith("--model=")) options.model = arg.slice("--model=".length);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--titles-file") options.titlesFile = argv[++i];
    else if (arg.startsWith("--titles-file=")) {
      options.titlesFile = arg.slice("--titles-file=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.fromContentReport && !options.fromHosted) {
    throw new Error("--from-content-report or --from-hosted is required");
  }
  if (options.write && options.dryRun) {
    throw new Error("--write cannot be combined with --dry-run");
  }
  return options;
}

function loadJsonLoose(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error(`No JSON object in ${filePath}`);
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function loadFilmsFromContentReport(filePath, limit = null) {
  const report = loadJsonLoose(filePath);
  const rows = report.results ?? report.candidates ?? [];
  const films = rows
    .filter((row) => !row.skipped && (row.the_mood || row.synopsis))
    .map((row) => ({
      id: row.id,
      title: row.title,
      year: row.year,
      synopsis: row.synopsis,
      technique: row.technique,
      moods: row.moods ?? [],
      previous_the_mood: row.the_mood,
      the_mood: row.the_mood,
    }));
  return limit != null ? films.slice(0, limit) : films;
}

async function loadFilmsFromHosted(options) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, year, synopsis, the_mood, technique, moods, content_status, review_status, media_status"
    )
    .order("created_at", { ascending: true });
  if (options.source) query = query.eq("source", options.source);
  const { data, error } = await query;
  if (error) throw error;
  const films = (data ?? [])
    .filter((row) => row.synopsis)
    .map((row) => ({
      id: row.id,
      title: row.title,
      year: row.year,
      synopsis: row.synopsis,
      technique: row.technique,
      moods: row.moods ?? [],
      previous_the_mood: row.the_mood,
      the_mood: row.the_mood,
      content_status: row.content_status,
      review_status: row.review_status,
      media_status: row.media_status,
    }));
  return {
    supabase,
    films: options.limit != null ? films.slice(0, options.limit) : films,
  };
}

function pickSpotlights(results) {
  const byTitle = new Map(results.map((row) => [row.title, row]));
  const required = SPOTLIGHT_TITLES.map((title) => byTitle.get(title)).filter(
    Boolean
  );
  const unchanged = results.find((row) => row.unchanged);
  const improved = results
    .filter((row) => !row.unchanged)
    .sort(
      (a, b) =>
        (b.new_the_mood?.length ?? 0) - (a.new_the_mood?.length ?? 0)
    )[0];
  return {
    required,
    unchanged_example: unchanged ?? null,
    substantially_improved_example: improved ?? null,
  };
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const guide = loadMoodWritingGuide();
  if (!guide) {
    throw new Error(
      `Active Mood Writing Guide missing. Run: APP_ENV=hosted npm run films:mood-writing-guide`
    );
  }

  if (options.write) {
    if (process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
      throw new Error(
        "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 after dry-run."
      );
    }
    if (!options.fromHosted) {
      throw new Error("--write requires --from-hosted (staging candidates only)");
    }
  }

  let films;
  let supabase = null;
  if (options.fromHosted) {
    const loaded = await loadFilmsFromHosted(options);
    films = loaded.films;
    supabase = loaded.supabase;
  } else {
    films = loadFilmsFromContentReport(options.fromContentReport, options.limit);
  }

  if (options.titlesFile) {
    const titles = JSON.parse(fs.readFileSync(options.titlesFile, "utf8"));
    if (!Array.isArray(titles) || !titles.length) {
      throw new Error("--titles-file must be a non-empty JSON array of titles");
    }
    const wanted = new Set(titles.map((t) => String(t)));
    films = films.filter((film) => wanted.has(film.title));
    if (films.length !== wanted.size) {
      const found = new Set(films.map((f) => f.title));
      const missing = [...wanted].filter((t) => !found.has(t));
      throw new Error(`Titles not found in load set: ${missing.join(", ")}`);
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY required");
  const openai = new OpenAI({ apiKey: openaiKey });

  console.log(
    JSON.stringify(
      {
        phase: "start",
        films: films.length,
        guide_version: guide.version ?? MOOD_GUIDE_ID,
        dry_run: options.dryRun,
        write: options.write,
        from_hosted: options.fromHosted,
        writes_to_films_table: false,
        email_sent: false,
      },
      null,
      2
    )
  );

  const comparison = await runMoodOnlyComparisonBatch(films, {
    openai,
    guide,
    model: options.model,
  });

  let updated = 0;
  if (options.write && supabase) {
    for (const row of comparison.results) {
      if (!row.id || !row.new_the_mood) continue;
      const { error } = await supabase
        .from("film_discovery_candidates")
        .update({
          the_mood: row.new_the_mood,
          content_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
      updated += 1;
    }
  }

  const spotlights = pickSpotlights(comparison.results);
  const outPath =
    options.out ??
    path.join(
      ROOT,
      options.write
        ? "tmp/mood-only-hosted-write-50.json"
        : "tmp/mood-only-comparison-50.json"
    );
  const payload = {
    generated_at: new Date().toISOString(),
    source_content_report: options.fromContentReport,
    from_hosted: options.fromHosted,
    source: options.source,
    guide_version: comparison.guide_version,
    metrics: comparison.metrics,
    spotlights,
    results: comparison.results,
    databaseMutated: Boolean(options.write && updated > 0),
    candidates_updated: updated,
    fields_updated: options.write ? ["the_mood", "content_updated_at"] : [],
    writes_to_films_table: false,
    email_sent: false,
    review_status_unchanged: true,
    media_status_unchanged: true,
    synopsis_unchanged: true,
    technique_unchanged: true,
    moods_unchanged: true,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log(
    JSON.stringify(
      {
        phase: "done",
        outPath,
        metrics: comparison.metrics,
        databaseMutated: payload.databaseMutated,
        candidates_updated: updated,
        fields_updated: payload.fields_updated,
        writes_to_films_table: false,
        email_sent: false,
        spotlights: {
          required_titles: spotlights.required.map((r) => ({
            title: r.title,
            previous_the_mood: r.previous_the_mood,
            new_the_mood: r.new_the_mood,
            unchanged: r.unchanged,
            reviewer_verdict: r.reviewer_verdict,
            principles_applied: r.principles_applied,
            note: r.writer_note,
            reviewer_summary: r.reviewer_summary,
          })),
        },
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
