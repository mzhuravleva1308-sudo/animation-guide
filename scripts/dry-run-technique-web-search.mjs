#!/usr/bin/env node
/**
 * Dry-run technique research for discovery candidates with empty technique.
 * Optional web search + AI last-level inference. Does not write to DB.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/dry-run-technique-web-search.mjs --source manual_seed --limit 10
 *   APP_ENV=hosted node scripts/dry-run-technique-web-search.mjs --limit 10 --with-ai
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import { gatherContentFactPack } from "../lib/film-discovery-content.mjs";
import { createWikipediaResearchState } from "../lib/film-discovery-content-research.mjs";
import {
  createTechniqueWebSearchState,
} from "../lib/film-discovery-technique-web-search.mjs";
import {
  isDistinctiveTechniqueLabel,
  normalizeDiscoveryTechniqueLabels,
  preferEvidenceBackedTechniqueLabels,
  resolveTechniqueStatusPolicy,
} from "../lib/film-discovery-technique.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELECT =
  "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, technique, content_note, content_status";

function parseArgs(argv) {
  const options = {
    source: "manual_seed",
    limit: 10,
    out: null,
    skipWikipedia: true,
    withAi: false,
    skipWebSearch: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") options.source = argv[++i];
    else if (arg.startsWith("--source=")) options.source = arg.slice(9);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--with-wikipedia") options.skipWikipedia = false;
    else if (arg === "--with-ai") options.withAi = true;
    else if (arg === "--skip-web-search") options.skipWebSearch = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  return options;
}

function hasTechnique(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim().length > 0;
}

function resolveProposedTechnique(techniqueEvidence) {
  const labels = preferEvidenceBackedTechniqueLabels([], techniqueEvidence);
  const normalized = normalizeDiscoveryTechniqueLabels(
    labels.length ? labels.join(", ") : null
  );
  const policy = resolveTechniqueStatusPolicy({
    labels: normalized.labels,
    diagnostics: normalized.diagnostics,
    nonBlockingUnknown: normalized.nonBlockingUnknown,
    blockingUnknown: normalized.blockingUnknown,
    unknown: normalized.unknown,
    techniqueEvidence,
  });
  const distinctive = normalized.labels.filter((label) =>
    isDistinctiveTechniqueLabel(label)
  );
  return {
    technique: normalized.labels.length ? normalized.labels.join(", ") : null,
    distinctive,
    techniqueNotes: policy.techniqueNotes ?? [],
  };
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

  const openaiKey = process.env.OPENAI_API_KEY;
  if (options.withAi && !openaiKey) {
    throw new Error("OPENAI_API_KEY required for --with-ai");
  }
  const openai = options.withAi ? new OpenAI({ apiKey: openaiKey }) : null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: candidates, error } = await supabase
    .from("film_discovery_candidates")
    .select(SELECT)
    .eq("source", options.source)
    .order("title", { ascending: true });
  if (error) throw error;

  const empty = (candidates ?? []).filter((row) => !hasTechnique(row.technique));
  const sample = empty.slice(0, options.limit);
  if (!sample.length) throw new Error("No empty-technique candidates found");

  const wikipediaState = createWikipediaResearchState({
    delayMs: options.skipWikipedia ? 0 : undefined,
  });
  const webSearchState = createTechniqueWebSearchState({
    budget: Math.max(options.limit * 6, 40),
    delayMs: options.skipWebSearch ? 0 : 2000,
  });

  /** @type {object[]} */
  const results = [];
  let withEvidence = 0;
  let withProposal = 0;
  let aiAccepted = 0;

  for (const candidate of sample) {
    const factPack = await gatherContentFactPack(candidate, {
      tmdbApiKey,
      wikipediaState,
      webSearchState,
      openai,
      enableWikipedia: !options.skipWikipedia,
      enableSourceFetch: true,
      enableWebSearch: !options.skipWebSearch,
      enableAiTechnique: options.withAi,
      researchDelayMs: undefined,
    });

    const evidence = factPack.techniqueEvidence ?? [];
    const proposed = resolveProposedTechnique(evidence);
    if (evidence.length) withEvidence += 1;
    if (proposed.technique) withProposal += 1;
    if (evidence.some((row) => row.tier === "ai")) aiAccepted += 1;

    const row = {
      id: candidate.id,
      title: candidate.title,
      year: candidate.year,
      source_urls: candidate.source_urls ?? [],
      technique_before: candidate.technique ?? null,
      technique_proposed: proposed.technique,
      evidence: evidence.map((e) => ({
        label: e.label,
        tier: e.tier,
        sourceLabel: e.sourceLabel,
        evidenceSummary: e.evidenceSummary,
        aiConfidence: e.aiConfidence ?? null,
      })),
      web_search_urls: factPack.webSearchUrls ?? [],
      research_notes: factPack.researchNotes ?? [],
      technique_notes: proposed.techniqueNotes,
      used_ai: Boolean(factPack.usedAiTechnique),
    };
    results.push(row);
    console.log(
      JSON.stringify({
        title: row.title,
        proposed: row.technique_proposed,
        evidence: row.evidence.map((e) => `${e.tier}:${e.label}`),
        notes: row.research_notes.filter((n) =>
          /web_search|ai_technique/i.test(n)
        ),
      })
    );
  }

  const outPath =
    options.out ??
    path.join(
      ROOT,
      options.withAi
        ? `tmp/technique-ai-dry-run-${sample.length}.json`
        : `tmp/technique-web-search-dry-run-${sample.length}.json`
    );
  const payload = {
    generated_at: new Date().toISOString(),
    source: options.source,
    dryRun: true,
    databaseMutated: false,
    writes_to_films_table: false,
    limit: options.limit,
    empty_technique_pool: empty.length,
    sampled: sample.length,
    skipWikipedia: options.skipWikipedia,
    withAi: options.withAi,
    skipWebSearch: options.skipWebSearch,
    tallies: {
      with_evidence: withEvidence,
      with_proposal: withProposal,
      empty_proposal: sample.length - withProposal,
      ai_accepted: aiAccepted,
    },
    web_search_metrics: {
      requests: webSearchState.requests,
      hits: webSearchState.hits,
      errors: webSearchState.errors,
      rateLimited: webSearchState.rateLimited,
      stopped: webSearchState.stopped,
    },
    results,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify(
      {
        phase: "done",
        out: outPath,
        tallies: payload.tallies,
        web_search_metrics: payload.web_search_metrics,
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
