#!/usr/bin/env node
/**
 * Generate Resonale Mood Writing Guide from hosted films.the_mood corpus.
 *
 * Safe by default:
 *   - reads films only
 *   - never writes films / publish / email
 *   - --dry-run: analyze corpus + print report, no LLM, no artifact write
 *   - --preview: run analyst, print guides, do not write active guide
 *   - default (no flags): write reports/ + active guide under lib/editorial/
 *
 * Usage:
 *   APP_ENV=hosted node scripts/generate-resonale-mood-writing-guide.mjs --dry-run
 *   APP_ENV=hosted node scripts/generate-resonale-mood-writing-guide.mjs --preview
 *   APP_ENV=hosted node scripts/generate-resonale-mood-writing-guide.mjs
 *   APP_ENV=hosted node scripts/generate-resonale-mood-writing-guide.mjs --corpus-file tmp/films-mood-corpus.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { prepareMoodCorpus } from "../lib/film-mood-corpus.mjs";
import { runMoodAnalyst } from "../lib/film-mood-analyst.mjs";
import {
  MOOD_GUIDE_ID,
  MOOD_GUIDE_REPORTS_DIR,
  saveMoodWritingGuideArtifact,
} from "../lib/film-mood-writing-guide.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    dryRun: false,
    preview: false,
    corpusFile: null,
    outReport: null,
    model: "gpt-4.1",
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--preview") options.preview = true;
    else if (arg === "--corpus-file") options.corpusFile = argv[++i];
    else if (arg.startsWith("--corpus-file=")) {
      options.corpusFile = arg.slice("--corpus-file=".length);
    } else if (arg === "--out") options.outReport = argv[++i];
    else if (arg.startsWith("--out=")) options.outReport = arg.slice("--out=".length);
    else if (arg === "--model") options.model = argv[++i];
    else if (arg.startsWith("--model=")) options.model = arg.slice("--model=".length);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function fetchHostedFilms(supabase, limit = null) {
  const pageSize = 500;
  /** @type {object[]} */
  const films = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("films")
      .select(
        "id, title, year, technique, the_mood, moods, synopsis, catalog_visible"
      )
      .order("title", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const batch = data ?? [];
    films.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
    if (limit != null && films.length >= limit) break;
  }
  return limit != null ? films.slice(0, limit) : films;
}

function corpusSummary(report) {
  return {
    total_mood_records: report.total_mood_records,
    included_in_corpus: report.included_in_corpus,
    excluded: report.excluded,
    exclusion_reasons: report.exclusion_reasons,
    near_duplicates: report.near_duplicates,
    repeated_openings: report.repeated_openings,
    stats: report.stats,
    writes_to_films_table: false,
    publish: false,
    email_sent: false,
  };
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));

  let films;
  let prebuiltReport = null;
  if (options.corpusFile) {
    const raw = JSON.parse(fs.readFileSync(options.corpusFile, "utf8"));
    if (raw?.corpus && raw?.summary && Array.isArray(raw.corpus)) {
      // Already-prepared dump from a prior dry-run
      prebuiltReport = {
        ...raw.summary,
        corpus: raw.corpus,
        excluded_rows: raw.excluded_rows ?? [],
        near_duplicate_samples: raw.near_duplicate_samples ?? [],
        total_mood_records: raw.summary.total_mood_records,
        included_in_corpus: raw.summary.included_in_corpus,
        excluded: raw.summary.excluded,
        exclusion_reasons: raw.summary.exclusion_reasons ?? {},
        near_duplicates: raw.summary.near_duplicates ?? 0,
        repeated_openings: raw.summary.repeated_openings ?? [],
        stats: raw.summary.stats ?? {},
      };
      films = raw.corpus;
    } else {
      films = Array.isArray(raw) ? raw : raw.films ?? raw.corpus ?? [];
    }
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (or pass --corpus-file)"
      );
    }
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    films = await fetchHostedFilms(supabase, options.limit);
  }

  const report = prebuiltReport ?? prepareMoodCorpus(films);
  const summary = corpusSummary(report);

  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  const corpusDumpPath = path.join(ROOT, "tmp/mood-writing-guide-corpus.json");
  fs.writeFileSync(
    corpusDumpPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        summary,
        corpus: report.corpus,
        excluded_rows: report.excluded_rows,
        near_duplicate_samples: report.near_duplicate_samples,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({ phase: "corpus", ...summary, corpusDumpPath }, null, 2));

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          phase: "dry-run",
          note: "Corpus prepared only. No LLM analyst, no guide write.",
          guide_version: MOOD_GUIDE_ID,
          writes_to_films_table: false,
          email_sent: false,
        },
        null,
        2
      )
    );
    return;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY is required for Mood analyst");

  const openai = new OpenAI({ apiKey: openaiKey });
  const artifact = await runMoodAnalyst(report, {
    openai,
    model: options.model,
  });

  const writeActive = !options.preview;
  const dryRunWrite = false;
  const saved = saveMoodWritingGuideArtifact(artifact, {
    writeActive,
    dryRun: dryRunWrite,
  });

  const reportOut =
    options.outReport ??
    path.join(MOOD_GUIDE_REPORTS_DIR, `${artifact.version}-full.json`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, JSON.stringify(artifact, null, 2));

  console.log(
    JSON.stringify(
      {
        phase: options.preview ? "preview" : "saved",
        version: artifact.version,
        corpus_size: artifact.corpus_size,
        excluded_record_count: artifact.excluded_record_count,
        self_review_verdict: artifact.self_review?.verdict ?? null,
        active_written: writeActive,
        reportPath: saved.reportPath,
        fullReportPath: reportOut,
        activePath: writeActive ? saved.activePath : null,
        writes_to_films_table: false,
        publish: false,
        email_sent: false,
        initial_guide_sections: Object.keys(
          artifact.initial_guide?.sections ?? artifact.initial_guide ?? {}
        ),
        final_guide_good_examples:
          artifact.final_guide?.sections?.good_examples?.length ??
          artifact.final_guide?.good_examples?.length ??
          0,
        final_guide_anti_examples:
          artifact.final_guide?.sections?.anti_examples?.length ??
          artifact.final_guide?.anti_examples?.length ??
          0,
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
