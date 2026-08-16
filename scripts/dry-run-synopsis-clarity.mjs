#!/usr/bin/env node
/**
 * Synopsis-only rewrite for one-glance clarity (Content Style Guide v4).
 * Leaves the_mood / technique / moods untouched. Does not write films or publish.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/dry-run-synopsis-clarity.mjs --source manual_seed --limit 15
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/dry-run-synopsis-clarity.mjs --source manual_seed --limit 50 --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  buildSynopsisClarityRewritePrompt,
  findSynopsisNameLikeTokens,
  gatherContentFactPack,
  synopsisHasPlotChain,
  validateDiscoveryContentDraft,
} from "../lib/film-discovery-content.mjs";
import { CONTENT_STYLE_GUIDE_VERSION } from "../lib/film-discovery-content-style-guide.mjs";
import { createWikipediaResearchState } from "../lib/film-discovery-content-research.mjs";
import { cleanupEditorialField, countWords } from "../lib/film-editorial-copy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELECT =
  "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, synopsis, the_mood, technique, moods, content_status, content_note, source";

const GENERIC_VERB_RE =
  /\b(navigate[sd]?|navigating|balance[sd]?|balancing|face(?:s|d)? turmoil|facing turmoil|confront(?:s|ed|ing)? challenges?|deal(?:s|t|ing)? with (?:issues?|challenges?)|explore[sd]? themes?)\b/i;

function parseArgs(argv) {
  const options = {
    source: "manual_seed",
    limit: 50,
    out: null,
    skipWikipedia: true,
    write: false,
    titles: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") options.source = argv[++i];
    else if (arg.startsWith("--source=")) options.source = arg.slice(9);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else if (arg === "--out") options.out = argv[++i];
    else if (arg.startsWith("--out=")) options.out = arg.slice(6);
    else if (arg === "--with-wikipedia") options.skipWikipedia = false;
    else if (arg === "--write") options.write = true;
    else if (arg === "--titles") options.titles = argv[++i];
    else if (arg.startsWith("--titles=")) options.titles = arg.slice(9);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  if (options.titles) {
    options.titleSet = new Set(
      options.titles
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean)
    );
  }
  return options;
}

function synopsisDiagnostics(synopsis) {
  const text = cleanupEditorialField(synopsis) ?? "";
  const nameTokens = findSynopsisNameLikeTokens(text);
  return {
    words: countWords(text),
    name_like_tokens: nameTokens,
    name_stack: nameTokens.length >= 2,
    plot_chain: synopsisHasPlotChain(text),
    generic_verb: GENERIC_VERB_RE.test(text),
  };
}

/** Synopsis-only hard blockers (ignore mood/technique issues for this write path). */
function synopsisWriteBlockers(synopsis) {
  const text = cleanupEditorialField(synopsis) ?? "";
  /** @type {string[]} */
  const blockers = [];
  if (!text) blockers.push("empty");
  const words = countWords(text);
  if (words > 0 && words < 8) blockers.push(`too_short_${words}`);
  if (words > 38) blockers.push(`too_long_${words}`);
  const names = findSynopsisNameLikeTokens(text);
  if (names.length >= 2) blockers.push(`name_stack:${names.slice(0, 4).join(",")}`);
  return blockers;
}

function parseJsonFromModelText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function main() {
  applyAppEnv({ mode: "hosted" });
  const options = parseArgs(process.argv.slice(2));

  if (options.write && process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 --write after dry-run."
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }
  if (!openaiKey) throw new Error("OPENAI_API_KEY required");
  if (!tmdbApiKey) throw new Error("TMDB_API_KEY required");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });
  const wikipediaState = createWikipediaResearchState({
    maxCalls: options.skipWikipedia ? 0 : 20,
  });

  const { data: candidates, error } = await supabase
    .from("film_discovery_candidates")
    .select(SELECT)
    .eq("source", options.source)
    .not("synopsis", "is", null)
    .order("title", { ascending: true })
    .limit(options.limit);
  if (error) throw error;

  const sample = (candidates ?? [])
    .filter((row) => String(row.synopsis ?? "").trim())
    .filter((row) =>
      options.titleSet ? options.titleSet.has(row.title) : true
    );
  if (options.titleSet && sample.length !== options.titleSet.size) {
    const found = new Set(sample.map((r) => r.title));
    const missing = [...options.titleSet].filter((t) => !found.has(t));
    throw new Error(`Titles not found: ${missing.join(", ")}`);
  }
  /** @type {object[]} */
  const results = [];
  let updated = 0;

  console.error(
    JSON.stringify(
      {
        phase: "start",
        count: sample.length,
        write: options.write,
        style_guide_version: CONTENT_STYLE_GUIDE_VERSION,
        writes_to_films_table: false,
      },
      null,
      2
    )
  );

  for (let index = 0; index < sample.length; index += 1) {
    const row = sample[index];
    console.error(`[${index + 1}/${sample.length}] ${row.title} (${row.year})`);

    const factPack = await gatherContentFactPack(row, {
      tmdbApiKey,
      enableWikipedia: !options.skipWikipedia,
      enableSourceFetch: false,
      wikipediaState,
    });

    let rewritten = null;
    let modelError = null;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You rewrite synopsis only for Resonale. Style guide ${CONTENT_STYLE_GUIDE_VERSION}. Return JSON only.`,
          },
          {
            role: "user",
            content: buildSynopsisClarityRewritePrompt(
              row,
              factPack,
              row.synopsis
            ),
          },
        ],
      });
      rewritten = parseJsonFromModelText(
        response.choices?.[0]?.message?.content
      );
    } catch (err) {
      modelError = err instanceof Error ? err.message : String(err);
    }

    const afterSynopsis = cleanupEditorialField(rewritten?.synopsis) ?? null;
    const writeBlockers = synopsisWriteBlockers(afterSynopsis);
    const validated =
      afterSynopsis && row.the_mood
        ? validateDiscoveryContentDraft(
            {
              synopsis: afterSynopsis,
              the_mood: row.the_mood,
              technique: row.technique,
              moods: row.moods,
            },
            {
              tmdbOverview: factPack.tmdbOverview,
              techniqueEvidence: factPack.techniqueEvidence ?? [],
            }
          )
        : null;

    const beforeDiag = synopsisDiagnostics(row.synopsis);
    const afterDiag = synopsisDiagnostics(afterSynopsis);

    let wrote = false;
    if (
      options.write &&
      afterSynopsis &&
      writeBlockers.length === 0 &&
      !modelError &&
      afterSynopsis !== cleanupEditorialField(row.synopsis)
    ) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({
          synopsis: afterSynopsis,
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
      year: row.year,
      before: {
        synopsis: row.synopsis,
        ...beforeDiag,
      },
      after: {
        synopsis: afterSynopsis,
        notes: rewritten?.notes ?? null,
        ...afterDiag,
        validation_ok: validated?.ok ?? null,
        validation_issues: validated?.issues ?? [],
        validation_soft_notes: validated?.softNotes ?? [],
        write_blockers: writeBlockers,
      },
      improved: {
        cleared_name_stack: beforeDiag.name_stack && !afterDiag.name_stack,
        cleared_plot_chain: beforeDiag.plot_chain && !afterDiag.plot_chain,
        cleared_generic_verb:
          beforeDiag.generic_verb && !afterDiag.generic_verb,
        still_name_stack: Boolean(afterDiag.name_stack),
        still_plot_chain: Boolean(afterDiag.plot_chain),
        still_generic_verb: Boolean(afterDiag.generic_verb),
      },
      model_error: modelError,
      wrote,
      writes_to_db: wrote,
    });
  }

  const report = {
    dry_run: !options.write,
    write: options.write,
    writes_to_films_table: false,
    database_mutated: options.write && updated > 0,
    candidates_updated: updated,
    fields_updated: options.write ? ["synopsis", "content_updated_at"] : [],
    the_mood_unchanged: true,
    technique_unchanged: true,
    moods_unchanged: true,
    review_status_unchanged: true,
    media_status_unchanged: true,
    email_sent: false,
    style_guide_version: CONTENT_STYLE_GUIDE_VERSION,
    source: options.source,
    limit: options.limit,
    count: results.length,
    tallies: {
      before_name_stack: results.filter((r) => r.before.name_stack).length,
      after_name_stack: results.filter((r) => r.after.name_stack).length,
      before_generic_verb: results.filter((r) => r.before.generic_verb).length,
      after_generic_verb: results.filter((r) => r.after.generic_verb).length,
      before_plot_chain: results.filter((r) => r.before.plot_chain).length,
      after_plot_chain: results.filter((r) => r.after.plot_chain).length,
      wrote: results.filter((r) => r.wrote).length,
      skipped_write_blockers: results.filter(
        (r) => (r.after.write_blockers ?? []).length > 0
      ).length,
      model_errors: results.filter((r) => r.model_error).length,
    },
    results,
  };

  const outPath =
    options.out ||
    path.join(
      ROOT,
      "tmp",
      options.write
        ? `synopsis-clarity-hosted-write-${options.limit}.json`
        : `synopsis-clarity-dry-run-${options.limit}.json`
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        out: outPath,
        tallies: report.tallies,
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
