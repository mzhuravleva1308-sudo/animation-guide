#!/usr/bin/env node
/**
 * Mood-only comparison dry-run for discovery candidates.
 * Uses Mood Writing Guide; does not mutate films / synopsis / technique / moods / publish / email.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/run-mood-only-comparison.mjs \
 *     --from-content-report tmp/discovery-content-dry-run-50-v5.json \
 *     --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
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
    fromContentReport: null,
    out: null,
    model: "gpt-4.1-mini",
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--from-content-report") options.fromContentReport = argv[++i];
    else if (arg.startsWith("--from-content-report=")) {
      options.fromContentReport = arg.slice("--from-content-report=".length);
    } else if (arg === "--out") options.out = argv[++i];
    else if (arg.startsWith("--out=")) options.out = arg.slice("--out=".length);
    else if (arg === "--model") options.model = argv[++i];
    else if (arg.startsWith("--model=")) options.model = arg.slice("--model=".length);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.fromContentReport) {
    throw new Error("--from-content-report path is required");
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

  const films = loadFilmsFromContentReport(
    options.fromContentReport,
    options.limit
  );
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

  const spotlights = pickSpotlights(comparison.results);
  const outPath =
    options.out ??
    path.join(ROOT, "tmp/mood-only-comparison-50.json");
  const payload = {
    generated_at: new Date().toISOString(),
    source_content_report: options.fromContentReport,
    guide_version: comparison.guide_version,
    metrics: comparison.metrics,
    spotlights,
    results: comparison.results,
    databaseMutated: false,
    writes_to_films_table: false,
    email_sent: false,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log(
    JSON.stringify(
      {
        phase: "done",
        outPath,
        metrics: comparison.metrics,
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
          unchanged_example: spotlights.unchanged_example
            ? {
                title: spotlights.unchanged_example.title,
                the_mood: spotlights.unchanged_example.new_the_mood,
              }
            : null,
          improved_example: spotlights.substantially_improved_example
            ? {
                title: spotlights.substantially_improved_example.title,
                previous_the_mood:
                  spotlights.substantially_improved_example.previous_the_mood,
                new_the_mood:
                  spotlights.substantially_improved_example.new_the_mood,
              }
            : null,
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
