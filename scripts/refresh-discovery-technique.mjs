#!/usr/bin/env node
/**
 * Technique-only refresh for film_discovery_candidates.
 * Re-researches technique evidence and applies the evidence-only policy.
 * Does not rewrite synopsis / the_mood / moods, does not touch films or review/media.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/refresh-discovery-technique.mjs --dry-run --source manual_seed
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted node scripts/refresh-discovery-technique.mjs --source manual_seed --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import { gatherContentFactPack } from "../lib/film-discovery-content.mjs";
import { composeContentNote } from "../lib/film-discovery-content-note.mjs";
import {
  createWikipediaResearchState,
} from "../lib/film-discovery-content-research.mjs";
import {
  createTechniqueWebSearchState,
} from "../lib/film-discovery-technique-web-search.mjs";
import {
  isDistinctiveTechniqueLabel,
  normalizeDiscoveryTechniqueLabels,
  preferEvidenceBackedTechniqueLabels,
  resolveTechniqueStatusPolicy,
} from "../lib/film-discovery-technique.mjs";
import { DISCOVERY_CONTENT_STATUS } from "../lib/film-discovery.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELECT =
  "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, manager_why, researcher_why, source, review_status, eligibility_result, media_status, content_status, synopsis, the_mood, technique, moods, content_note, content_revision_count";

const TECHNIQUE_NOTE_RE =
  /technique|rotoscope|2d animation|stop-?motion|inferred|could not be determined|secondary source|left empty for manual|verify before approval/i;

function parseArgs(argv) {
  const options = {
    dryRun: true,
    write: false,
    source: "manual_seed",
    limit: null,
    out: null,
    skipWikipedia: false,
    withAi: false,
    enableWebSearch: false,
    emptyOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--write") {
      options.write = true;
      options.dryRun = false;
    } else if (arg === "--skip-wikipedia") options.skipWikipedia = true;
    else if (arg === "--with-ai") options.withAi = true;
    else if (arg === "--with-web-search") options.enableWebSearch = true;
    else if (arg === "--empty-only") options.emptyOnly = true;
    else if (arg === "--source") options.source = argv[++i];
    else if (arg.startsWith("--source=")) options.source = arg.slice(9);
    else if (arg === "--limit") options.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else if (arg === "--out") options.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  return options;
}

function splitNoteSentences(note) {
  return String(note ?? "")
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeContentNote(existingNote, techniqueNotes) {
  const kept = splitNoteSentences(existingNote).filter(
    (part) => !TECHNIQUE_NOTE_RE.test(part)
  );
  const techniqueHuman = composeContentNote(techniqueNotes);
  const merged = [...kept];
  if (techniqueHuman) {
    for (const part of splitNoteSentences(techniqueHuman)) {
      if (!merged.includes(part)) merged.push(part);
    }
  }
  return merged.length ? merged.join(" ") : null;
}

/**
 * Apply evidence-only policy, with a practical admin cleanup fallback:
 * - evidence wins when present;
 * - unverified generic labels (2D/3D/…) are cleared;
 * - existing distinctive labels may be kept with a verify note when research
 *   was rate-limited / empty (never invent new labels).
 */
function resolveTechniqueFromEvidence(
  currentTechnique,
  techniqueEvidence,
  researchNotes = []
) {
  const normalized = normalizeDiscoveryTechniqueLabels(currentTechnique);
  /** @type {string[]} */
  let labels = preferEvidenceBackedTechniqueLabels(
    normalized.labels,
    techniqueEvidence
  );
  /** @type {string[]} */
  const extraNotes = [];
  const researchBlocked = (researchNotes ?? []).some((note) =>
    /rate_limited|budget_exhausted/i.test(String(note))
  );

  if (!labels.length) {
    const distinctiveCurrent = normalized.labels.filter((label) =>
      isDistinctiveTechniqueLabel(label)
    );
    if (distinctiveCurrent.length) {
      labels = distinctiveCurrent.slice(0, 2);
      extraNotes.push(
        researchBlocked
          ? "Distinctive technique kept from prior draft; verify before approval (research rate-limited)."
          : "Distinctive technique kept from prior draft without a direct citation; verify before approval."
      );
    } else if (normalized.labels.length) {
      extraNotes.push(
        "Technique could not be determined from sources; left empty for manual review."
      );
    }
  }

  const policy = resolveTechniqueStatusPolicy({
    labels,
    diagnostics: normalized.diagnostics,
    nonBlockingUnknown: normalized.nonBlockingUnknown,
    blockingUnknown: normalized.blockingUnknown,
    unknown: normalized.unknown,
    techniqueEvidence,
  });

  // When we intentionally keep an unverified distinctive label, don't also say
  // "could not be determined" — that confuses the admin card.
  const keptUnverifiedDistinctive = Boolean(extraNotes.length && labels.length);
  const policyNotes = keptUnverifiedDistinctive
    ? (policy.techniqueNotes ?? []).filter(
        (note) =>
          !/could not be determined|lack a direct production-method citation|left for manual review/i.test(
            note
          )
      )
    : policy.techniqueNotes ?? [];

  return {
    technique: labels.length ? labels.join(", ") : null,
    labels,
    techniqueNotes: [...new Set([...extraNotes, ...policyNotes])],
    evidenceCount: techniqueEvidence.length,
    previousLabels: normalized.labels,
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
  if (options.write && process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 --write after dry-run."
    );
  }
  if (options.withAi && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY required for --with-ai");
  }
  const openai = options.withAi
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("film_discovery_candidates")
    .select(SELECT)
    .eq("source", options.source)
    .order("title", { ascending: true });
  if (options.limit) query = query.limit(options.limit);

  const { data: candidatesRaw, error } = await query;
  if (error) throw error;
  if (!candidatesRaw?.length) throw new Error(`No candidates for source=${options.source}`);

  const hasTechniqueValue = (value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    return String(value).trim().length > 0;
  };
  const candidates = options.emptyOnly
    ? candidatesRaw.filter((row) => !hasTechniqueValue(row.technique))
    : candidatesRaw;
  if (!candidates.length) {
    throw new Error(
      options.emptyOnly
        ? `No empty-technique candidates for source=${options.source}`
        : `No candidates for source=${options.source}`
    );
  }

  const wikipediaState = createWikipediaResearchState({
    delayMs: options.skipWikipedia ? 0 : undefined,
  });
  const webSearchState = options.enableWebSearch
    ? createTechniqueWebSearchState({
        budget: Math.max(candidates.length * 6, 40),
        delayMs: 2000,
      })
    : null;

  /** @type {object[]} */
  const results = [];
  let changed = 0;
  let cleared = 0;
  let setFromEvidence = 0;
  let keptDistinctive = 0;
  let unchanged = 0;

  for (const candidate of candidates) {
    // Gentle pacing between films — Wikipedia 429s cascade quickly otherwise.
    await new Promise((resolve) => setTimeout(resolve, 800));

    const factPack = await gatherContentFactPack(candidate, {
      tmdbApiKey,
      wikipediaState,
      webSearchState: webSearchState ?? undefined,
      openai,
      enableWikipedia: !options.skipWikipedia,
      enableSourceFetch: true,
      enableWebSearch: options.enableWebSearch,
      enableAiTechnique: options.withAi,
      // When Wikipedia is on, leave delay to soft wikipediaState (8s).
      // Passing 1200 here would override and re-trigger rate limits.
      researchDelayMs: options.skipWikipedia ? 200 : undefined,
    });

    if (
      !options.skipWikipedia &&
      (factPack.researchNotes ?? []).some((n) => /rate_limited/i.test(n))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    const resolved = resolveTechniqueFromEvidence(
      candidate.technique,
      factPack.techniqueEvidence ?? [],
      factPack.researchNotes ?? []
    );
    const before = candidate.technique ?? null;
    const after = resolved.technique;
    const content_note = mergeContentNote(
      candidate.content_note,
      resolved.techniqueNotes
    );
    const techniqueChanged = before !== after;
    const noteChanged = (candidate.content_note ?? null) !== content_note;

    if (techniqueChanged) {
      changed += 1;
      if (!after) cleared += 1;
      else if ((factPack.techniqueEvidence ?? []).length) setFromEvidence += 1;
      else keptDistinctive += 1;
    } else {
      unchanged += 1;
    }

    let content_status = candidate.content_status;
    if (content_note && content_status === DISCOVERY_CONTENT_STATUS.ready) {
      content_status = DISCOVERY_CONTENT_STATUS.readyWithNote;
    }

    const row = {
      id: candidate.id,
      title: candidate.title,
      before,
      after,
      technique_changed: techniqueChanged,
      note_changed: noteChanged,
      content_note_before: candidate.content_note ?? null,
      content_note_after: content_note,
      content_status_after: content_status,
      evidence: (factPack.techniqueEvidence ?? []).map((e) => ({
        label: e.label,
        tier: e.tier,
        confidence: e.confidence,
      })),
      research_notes: factPack.researchNotes ?? [],
      technique_notes: resolved.techniqueNotes,
    };
    results.push(row);

    if (options.write && (techniqueChanged || noteChanged || content_status !== candidate.content_status)) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({
          technique: after,
          content_note,
          content_status,
          content_updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id);
      if (updateError) throw updateError;
    }

    console.log(
      JSON.stringify({
        title: candidate.title,
        before,
        after,
        evidence: row.evidence.length,
        research_notes: row.research_notes,
      })
    );
  }

  const outPath =
    options.out ??
    path.join(
      ROOT,
      options.write
        ? "tmp/technique-refresh-hosted-write-50.json"
        : "tmp/technique-refresh-dry-run-50.json"
    );
  const payload = {
    generated_at: new Date().toISOString(),
    source: options.source,
    dryRun: !options.write,
    databaseMutated: Boolean(options.write),
    writes_to_films_table: false,
    fields_updated: options.write
      ? ["technique", "content_note", "content_status", "content_updated_at"]
      : [],
    synopsis_unchanged: true,
    the_mood_unchanged: true,
    moods_unchanged: true,
    review_status_unchanged: true,
    media_status_unchanged: true,
    tallies: {
      candidates: candidates.length,
      technique_changed: changed,
      cleared_to_empty: cleared,
      set_from_evidence: setFromEvidence,
      kept_distinctive_unverified: keptDistinctive,
      unchanged,
      with_evidence: results.filter((r) => r.evidence.length > 0).length,
    },
    wikipedia_metrics: {
      requests: wikipediaState.requests,
      errors: wikipediaState.errors,
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
