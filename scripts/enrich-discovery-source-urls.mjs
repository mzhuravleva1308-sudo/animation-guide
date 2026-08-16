#!/usr/bin/env node
/**
 * Backfill source_urls for discovery candidates seeded without them.
 * Uses TMDB homepage + Wikipedia external links only (no LLM URL invention).
 * Writes ONLY source_urls (+ content_updated_at if present is NOT touched).
 *
 * Usage:
 *   APP_ENV=hosted node scripts/enrich-discovery-source-urls.mjs --dry-run --source manual_seed
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted node scripts/enrich-discovery-source-urls.mjs --source manual_seed --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { createWikipediaResearchState } from "../lib/film-discovery-content-research.mjs";
import { enrichCandidateSourceUrls } from "../lib/film-discovery-source-enrichment.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELECT =
  "id, title, original_title, year, directors, countries, source_urls, source";

function parseArgs(argv) {
  const options = {
    dryRun: true,
    write: false,
    source: "manual_seed",
    limit: null,
    out: null,
    skipWikipedia: false,
    skipProbe: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--write") {
      options.write = true;
      options.dryRun = false;
    } else if (arg === "--skip-wikipedia") options.skipWikipedia = true;
    else if (arg === "--skip-probe") options.skipProbe = true;
    else if (arg === "--source") options.source = argv[++i];
    else if (arg.startsWith("--source=")) options.source = arg.slice(9);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else if (arg === "--out") options.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  applyAppEnv({ mode: "hosted" });
  const options = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }
  if (!tmdbApiKey) throw new Error("TMDB_API_KEY required");
  if (options.write && process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 --write after dry-run."
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("film_discovery_candidates")
    .select(SELECT)
    .eq("source", options.source)
    .order("title", { ascending: true });
  if (options.limit) query = query.limit(options.limit);

  const { data: candidates, error } = await query;
  if (error) throw error;
  if (!candidates?.length) throw new Error(`No candidates for source=${options.source}`);

  const wikipediaState = createWikipediaResearchState({
    // Soft defaults from research module (8s delay, budget 40).
    delayMs: options.skipWikipedia ? 0 : undefined,
  });

  /** @type {object[]} */
  const results = [];
  let filled = 0;
  let unchanged = 0;
  let empty = 0;

  for (const candidate of candidates) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const enrichment = await enrichCandidateSourceUrls(candidate, {
      tmdbApiKey,
      enableWikipedia: !options.skipWikipedia,
      enableProbe: !options.skipProbe,
      wikipediaState,
      maxUrls: 3,
    });

    if (
      !options.skipWikipedia &&
      enrichment.notes.some((n) => /rate_limited/i.test(n))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }

    const before = Array.isArray(candidate.source_urls)
      ? candidate.source_urls
      : [];
    const after = enrichment.source_urls;
    const changed =
      JSON.stringify([...(before ?? [])].map(String).sort()) !==
      JSON.stringify([...(after ?? [])].map(String).sort());

    if (after.length) filled += 1;
    else empty += 1;
    if (!changed) unchanged += 1;

    results.push({
      id: candidate.id,
      title: candidate.title,
      before,
      after,
      changed,
      notes: enrichment.notes,
      discovered: enrichment.discovered,
    });

    console.log(
      JSON.stringify({
        title: candidate.title,
        after,
        notes: enrichment.notes,
      })
    );

    if (options.write && after.length > 0 && changed) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({ source_urls: after })
        .eq("id", candidate.id);
      if (updateError) throw updateError;
    }
  }

  const outPath =
    options.out ??
    path.join(
      ROOT,
      options.write
        ? "tmp/source-url-enrich-hosted-write-50.json"
        : "tmp/source-url-enrich-dry-run-50.json"
    );
  const payload = {
    generated_at: new Date().toISOString(),
    source: options.source,
    dryRun: !options.write,
    databaseMutated: Boolean(options.write),
    fields_updated: options.write ? ["source_urls"] : [],
    writes_to_films_table: false,
    synopsis_unchanged: true,
    the_mood_unchanged: true,
    technique_unchanged: true,
    tallies: {
      candidates: candidates.length,
      with_urls_after: filled,
      still_empty: empty,
      unchanged,
      changed: results.filter((r) => r.changed && r.after.length).length,
    },
    wikipedia_metrics: {
      requests: wikipediaState.requests,
      errors: wikipediaState.errors,
      hits: wikipediaState.hits,
      budget: wikipediaState.budget,
    },
    results,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ phase: "done", out: outPath, tallies: payload.tallies }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
