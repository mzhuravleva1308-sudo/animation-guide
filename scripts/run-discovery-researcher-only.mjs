#!/usr/bin/env node
/**
 * Researcher-only harness for weekly film discovery.
 *
 * Runs: Manager brief → OpenAI Researcher (N rounds) → programmatic exclusion filter.
 * Does NOT run Eligibility, Media, Content, persist, or email.
 *
 * Usage:
 *   WEEKLY_FILM_DISCOVERY_ENABLED=1 APP_ENV=hosted \
 *     npm run films:discovery-researcher
 *
 *   … --rounds 1 --needed 10 --out tmp/researcher.json
 *   … --brief-focus country|decade|technique|mixed
 *   … --exclusion relevant|summary|full
 *   … --no-verify-tmdb
 *   … --force-enabled
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import { CATALOG_ANALYTICS_FILM_FIELDS } from "../lib/load-films-catalog.mjs";
import {
  DISCOVERY_DEFAULTS,
  DISCOVERY_MAX_RESEARCH_ROUNDS,
  discoveryWeekKey,
} from "../lib/film-discovery.mjs";
import {
  buildManagerBriefFromAnalytics,
  formatManagerBrief,
} from "../lib/film-discovery-manager.mjs";
import {
  BRIEF_FOCUS,
  focusManagerBrief,
  selectBriefRelevantFilms,
} from "../lib/film-discovery-brief-focus.mjs";
import {
  buildResearcherPrompt,
  normalizeResearcherCandidate,
  reviewCandidateEligibility,
} from "../lib/film-discovery-eligibility.mjs";
import {
  buildExclusionEntriesFromCandidates,
  buildExclusionEntriesFromFilms,
  filterResearcherCandidatesAgainstIndex,
  mergeExclusionIndexes,
  summarizeExclusionIndexSources,
} from "../lib/film-discovery-exclusion.mjs";
import {
  assessCandidateSourceCredibility,
  verifyCandidateExistsOnTmdb,
} from "../lib/film-discovery-source-verify.mjs";
import {
  callDiscoveryResearcher,
  filterAlreadyReviewedCandidates,
  resolveDiscoveryModel,
  resolveDiscoveryWebSearch,
} from "../lib/film-discovery-workflow.mjs";

function parseArgs(argv) {
  const options = {
    rounds: 1,
    needed: 15,
    out: null,
    /** @type {"relevant" | "summary" | "full"} */
    exclusionMode: "relevant",
    /** @type {"mixed" | "country" | "decade" | "technique"} */
    briefFocus: BRIEF_FOCUS.mixed,
    verifyTmdb: true,
    forceEnabled: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--rounds") options.rounds = Number(argv[++index]);
    else if (arg.startsWith("--rounds=")) {
      options.rounds = Number(arg.slice("--rounds=".length));
    } else if (arg === "--needed") options.needed = Number(argv[++index]);
    else if (arg.startsWith("--needed=")) {
      options.needed = Number(arg.slice("--needed=".length));
    } else if (arg === "--out") options.out = argv[++index];
    else if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
    } else if (arg === "--brief-focus") {
      options.briefFocus = String(argv[++index] || "");
    } else if (arg.startsWith("--brief-focus=")) {
      options.briefFocus = arg.slice("--brief-focus=".length);
    } else if (arg === "--exclusion") {
      options.exclusionMode = String(argv[++index] || "");
    } else if (arg.startsWith("--exclusion=")) {
      options.exclusionMode = arg.slice("--exclusion=".length);
    } else if (arg === "--compact-exclusion") {
      options.exclusionMode = "summary";
    } else if (arg === "--full-exclusion") {
      options.exclusionMode = "full";
    } else if (arg === "--no-verify-tmdb") {
      options.verifyTmdb = false;
    } else if (arg === "--verify-tmdb") {
      options.verifyTmdb = true;
    } else if (arg === "--force-enabled") options.forceEnabled = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Object.values(BRIEF_FOCUS).includes(options.briefFocus)) {
    throw new Error(
      `--brief-focus must be one of: ${Object.values(BRIEF_FOCUS).join(", ")}`
    );
  }
  if (!["relevant", "summary", "full"].includes(options.exclusionMode)) {
    throw new Error("--exclusion must be relevant|summary|full");
  }

  if (
    !Number.isInteger(options.rounds) ||
    options.rounds < 1 ||
    options.rounds > DISCOVERY_MAX_RESEARCH_ROUNDS
  ) {
    throw new Error(
      `--rounds must be an integer 1–${DISCOVERY_MAX_RESEARCH_ROUNDS}`
    );
  }
  if (
    !Number.isInteger(options.needed) ||
    options.needed < 1 ||
    options.needed > 20
  ) {
    throw new Error("--needed must be an integer between 1 and 20");
  }

  return options;
}

function requireEnabled(forceEnabled) {
  if (forceEnabled) return;
  if (process.env.WEEKLY_FILM_DISCOVERY_ENABLED === "1") return;
  throw new Error(
    "Set WEEKLY_FILM_DISCOVERY_ENABLED=1 or pass --force-enabled"
  );
}

/**
 * Soft gap signal for the report (not Eligibility).
 * @param {object} candidate
 * @param {import("../lib/film-discovery.mjs").ManagerBrief} brief
 */
function scoreGapHints(candidate, brief) {
  const countries = (candidate.countries ?? []).map((c) =>
    String(c).toLowerCase()
  );
  const countryHits = (brief.priorityCountries ?? []).filter((p) =>
    countries.some(
      (c) => c.includes(String(p).toLowerCase()) || String(p).toLowerCase().includes(c)
    )
  );
  const year = Number(candidate.year);
  const decade =
    Number.isFinite(year) && year > 0 ? `${Math.floor(year / 10) * 10}s` : null;
  const decadeHit =
    decade && (brief.priorityYearsOrDecades ?? []).includes(decade)
      ? decade
      : null;

  return {
    country_hits: countryHits,
    decade_hit: decadeHit,
    looks_like_gap: countryHits.length > 0 || Boolean(decadeHit),
  };
}

function defaultOutPath(weekKey) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("tmp", `discovery-researcher-${weekKey}-${stamp}.json`);
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  requireEnabled(options.forceEnabled);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  const { data: catalogFilms, error: catalogError } = await supabase
    .from("films")
    .select(CATALOG_ANALYTICS_FILM_FIELDS)
    .order("id");
  if (catalogError) throw catalogError;

  const { data: existingCandidates, error: candidatesError } = await supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, original_title, year, directors, countries, review_status, reject_reason, normalized_title, normalized_original_title, source_urls"
    );
  if (candidatesError) throw candidatesError;

  const brief = buildManagerBriefFromAnalytics(catalogFilms ?? []);
  const staging = filterAlreadyReviewedCandidates(existingCandidates ?? []);
  const exclusionIndex = mergeExclusionIndexes(
    buildExclusionEntriesFromFilms(catalogFilms ?? []),
    buildExclusionEntriesFromCandidates(staging)
  );
  const exclusionCounts = summarizeExclusionIndexSources(exclusionIndex);
  const weekKey = discoveryWeekKey(new Date());

  /** @type {Array<object>} */
  const rounds = [];
  /** @type {Array<{ title: string, year: number, reason: string }>} */
  const rejectedThisRun = [];
  /** @type {object[]} */
  let allVerified = [];
  /** @type {object[]} */
  let allDuplicates = [];
  /** @type {object[]} */
  let allInvented = [];
  const tmdbApiKey = process.env.TMDB_API_KEY || null;

  for (let round = 1; round <= options.rounds; round += 1) {
    const stillNeeded = Math.max(0, options.needed - allVerified.length);
    if (stillNeeded === 0) break;

    const prompt = buildResearcherPrompt({
      brief,
      exclusionIndex,
      needed: stillNeeded,
      round,
      exclusionListMode: options.compactExclusion ? "summary" : "full",
      rejectedThisRun,
    });

    const raw = await callDiscoveryResearcher(openai, {
      system:
        "You are Researcher for Resonale film discovery. Prefer web search. Return JSON only. Never invent films or URLs.",
      user: prompt,
    });

    const list = Array.isArray(raw?.candidates)
      ? raw.candidates
      : Array.isArray(raw)
        ? raw
        : [];
    const normalized = list
      .map((item) => normalizeResearcherCandidate(item))
      .filter(Boolean);

    const { accepted, rejected } = filterResearcherCandidatesAgainstIndex(
      normalized,
      exclusionIndex
    );

    for (const dup of rejected) {
      rejectedThisRun.push({
        title: dup.candidate.title,
        year: dup.candidate.year,
        reason: `duplicate (${dup.matched?.source ?? "?"})`,
      });
      allDuplicates.push({
        ...dup.candidate,
        matched: dup.matched,
        round,
      });
    }

    /** @type {object[]} */
    const roundVerified = [];
    /** @type {object[]} */
    const roundInvented = [];

    for (const candidate of accepted) {
      const sourceCheck = assessCandidateSourceCredibility(candidate);
      const eligibility = reviewCandidateEligibility(candidate, {
        exclusionIndex,
      });

      let tmdbCheck = null;
      if (options.verifyTmdb && tmdbApiKey && sourceCheck.ok) {
        try {
          tmdbCheck = await verifyCandidateExistsOnTmdb(candidate, {
            tmdbApiKey,
          });
        } catch (error) {
          tmdbCheck = {
            ok: false,
            skipped: false,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      } else if (options.verifyTmdb && !tmdbApiKey) {
        tmdbCheck = {
          ok: false,
          skipped: true,
          reason: "TMDB_API_KEY missing",
        };
      }

      const invented =
        !sourceCheck.ok ||
        eligibility.reason_code === "insufficient_sources" ||
        (tmdbCheck && !tmdbCheck.skipped && !tmdbCheck.ok);

      const row = {
        ...candidate,
        round,
        gap: scoreGapHints(candidate, brief),
        source_check: sourceCheck,
        eligibility_reasons: eligibility.reasons,
        tmdb_check: tmdbCheck,
      };

      if (invented) {
        roundInvented.push(row);
        allInvented.push(row);
        rejectedThisRun.push({
          title: candidate.title,
          year: candidate.year,
          reason: !sourceCheck.ok
            ? "invented_sources"
            : "no_tmdb_match",
        });
      } else {
        roundVerified.push(row);
        allVerified.push(row);
      }
    }

    const proposed = [
      ...rejected.map((dup) => ({
        status: "duplicate",
        title: dup.candidate.title,
        year: dup.candidate.year,
        matched: dup.matched,
      })),
      ...roundInvented.map((c) => ({
        status: "invented",
        title: c.title,
        year: c.year,
        source_urls: c.source_urls,
        source_issues: c.source_check?.issues ?? [],
        tmdb: c.tmdb_check?.reason ?? null,
      })),
      ...roundVerified.map((c) => ({
        status: "verified_new",
        title: c.title,
        year: c.year,
        countries: c.countries,
        source_urls: c.source_urls,
        tmdb: c.tmdb_check?.match ?? null,
        gap: c.gap,
      })),
    ];

    rounds.push({
      round,
      asked_for: stillNeeded,
      proposed_count: normalized.length,
      duplicate_count: rejected.length,
      invented_count: roundInvented.length,
      verified_new_count: roundVerified.length,
      proposed,
    });

    console.error(
      `Round ${round}: proposed=${normalized.length} verified_new=${roundVerified.length} invented=${roundInvented.length} duplicate=${rejected.length}`
    );
  }
  const totalProposed = rounds.reduce((sum, r) => sum + r.proposed_count, 0);
  const report = {
    stage: "researcher_only",
    week_key: weekKey,
    dryRun: true,
    exclusion_list_mode: options.compactExclusion ? "summary" : "full",
    verify_tmdb: options.verifyTmdb,
    rounds_requested: options.rounds,
    needed: options.needed,
    model: resolveDiscoveryModel(),
    web_search: resolveDiscoveryWebSearch(),
    exclusion_index: exclusionCounts,
    manager_brief: {
      summary: brief.summary,
      priorityCountries: brief.priorityCountries,
      priorityYearsOrDecades: brief.priorityYearsOrDecades,
      priorityTechniques: brief.priorityTechniques,
      batchRequirements: brief.batchRequirements,
      text: formatManagerBrief(brief),
    },
    metrics: {
      proposed_total: totalProposed,
      verified_new_total: allVerified.length,
      invented_total: allInvented.length,
      duplicate_total: allDuplicates.length,
      duplicate_rate:
        totalProposed === 0
          ? null
          : Number((allDuplicates.length / totalProposed).toFixed(3)),
      invented_rate:
        totalProposed === 0
          ? null
          : Number((allInvented.length / totalProposed).toFixed(3)),
      gap_hits_among_verified: allVerified.filter((c) => c.gap?.looks_like_gap)
        .length,
    },
    verified_new_candidates: allVerified.map((c) => ({
      title: c.title,
      original_title: c.original_title,
      year: c.year,
      countries: c.countries,
      directors: c.directors,
      source_urls: c.source_urls,
      researcher_why: c.researcher_why,
      manager_why: c.manager_why,
      round: c.round,
      gap: c.gap,
      tmdb: c.tmdb_check?.match ?? null,
    })),
    invented_candidates: allInvented.map((c) => ({
      title: c.title,
      year: c.year,
      round: c.round,
      source_urls: c.source_urls,
      source_issues: c.source_check?.issues ?? [],
      tmdb_reason: c.tmdb_check?.reason ?? null,
    })),
    duplicate_candidates: allDuplicates.map((c) => ({
      title: c.title,
      year: c.year,
      round: c.round,
      matched: c.matched,
    })),
    rounds,
  };

  const outPath = options.out || defaultOutPath(weekKey);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        out: outPath,
        week_key: report.week_key,
        exclusion_list_mode: report.exclusion_list_mode,
        verify_tmdb: report.verify_tmdb,
        metrics: report.metrics,
        verified_new: report.verified_new_candidates.map(
          (c) => `${c.title} (${c.year})`
        ),
        invented: report.invented_candidates.map(
          (c) => `${c.title} (${c.year})`
        ),
        duplicates: report.duplicate_candidates.map(
          (c) => `${c.title} (${c.year}) ← ${c.matched?.source ?? "?"}`
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
