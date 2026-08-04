/**
 * Researcher + eligibility validation for weekly film discovery.
 * LLM calls are injectable; structural rules are deterministic and unit-tested.
 */

import {
  DISCOVERY_DEFAULTS,
  DISCOVERY_ELIGIBILITY,
  DISCOVERY_MAX_RESEARCH_ROUNDS,
  DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES,
  DISCOVERY_REJECT_REASON,
  DISCOVERY_TARGET_CANDIDATE_COUNT,
} from "./film-discovery.mjs";
import { formatManagerBrief } from "./film-discovery-manager.mjs";
import {
  buildExclusionEntry,
  buildMatchedRecord,
  EXCLUSION_ENTRY_SOURCE,
  formatExclusionIndexForResearcher,
  formatExclusionListForPrompt,
  matchAgainstExclusionIndex,
  normalizeDiscoveryIdentityString,
  summarizeExclusionIndexSources,
} from "./film-discovery-exclusion.mjs";

const REQUIRED_EVIDENCE_KEYS = [
  "full_length_feature",
  "fully_animated",
  "no_live_action_or_archive",
  "not_children_oriented",
  "independent_auteur_or_festival",
  "not_in_catalog",
  "standalone_release",
  "reliable_sources",
];

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    ),
  ];
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeSourceUrls(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((url) => /^https?:\/\/\S+$/i.test(url))
    ),
  ];
}

/**
 * @param {unknown} raw
 * @returns {import("./film-discovery.mjs").ResearcherCandidate | null}
 */
export function normalizeResearcherCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const year = Number(row.year);
  if (!title || !Number.isInteger(year) || year < 1888 || year > 2100) {
    return null;
  }

  const directors = normalizeStringList(row.directors);
  const countries = normalizeStringList(row.countries);
  const source_urls = normalizeSourceUrls(row.source_urls ?? row.sources);
  const runtimeRaw = row.runtime_minutes ?? row.runtime;
  const runtime_minutes =
    runtimeRaw == null || runtimeRaw === ""
      ? null
      : Number(runtimeRaw);

  /** @type {Record<string, string>} */
  const requirement_evidence = {};
  const evidenceRaw = row.requirement_evidence;
  if (evidenceRaw && typeof evidenceRaw === "object") {
    for (const [key, value] of Object.entries(
      /** @type {Record<string, unknown>} */ (evidenceRaw)
    )) {
      if (typeof value === "string" && value.trim()) {
        requirement_evidence[key] = value.trim();
      }
    }
  }

  return {
    title,
    original_title:
      typeof row.original_title === "string" && row.original_title.trim()
        ? row.original_title.trim()
        : null,
    year,
    directors,
    countries,
    runtime_minutes:
      Number.isInteger(runtime_minutes) && runtime_minutes > 0
        ? runtime_minutes
        : null,
    source_urls,
    researcher_why:
      typeof row.researcher_why === "string" ? row.researcher_why.trim() : "",
    manager_why:
      typeof row.manager_why === "string" ? row.manager_why.trim() : "",
    requirement_evidence,
  };
}

/**
 * Researcher must not submit a film without sources.
 * @param {import("./film-discovery.mjs").ResearcherCandidate} candidate
 */
export function researcherRequiresSources(candidate) {
  return normalizeSourceUrls(candidate.source_urls).length > 0;
}

/**
 * Prompt for Researcher. The live OpenAI user prompt includes the FULL compact
 * exclusion list (title / original_title / year only) before search.
 * Programmatic filter + Eligibility still re-check after the model responds.
 *
 * @param {object} options
 * @param {import("./film-discovery.mjs").ManagerBrief} options.brief
 * @param {object[]} [options.exclusionIndex]
 * @param {ReturnType<typeof formatExclusionIndexForResearcher>} [options.compactExclusion]
 * @param {import("./film-discovery.mjs").ResearcherCandidate[]} [options.alreadyPassed]
 * @param {number} [options.needed]
 * @param {number} [options.round]
 */
export function buildResearcherPrompt(options) {
  const needed = options.needed ?? DISCOVERY_TARGET_CANDIDATE_COUNT;
  const exclusionIndex = options.exclusionIndex ?? [];
  const compact =
    options.compactExclusion ??
    formatExclusionIndexForResearcher(exclusionIndex);
  const counts = summarizeExclusionIndexSources(exclusionIndex);
  const exclusionListText = formatExclusionListForPrompt(compact);

  return `
You are Researcher for Resonale weekly film discovery.
Find exactly ${needed} feature-length animation film candidates that match the Manager brief.
Do NOT invent films. Prefer well-documented independent / auteur / festival animation features.

Manager brief:
${formatManagerBrief(options.brief)}

Hard requirements for EVERY candidate:
- 100% animation (no live-action scenes, no archival video inserts)
- Feature film (not short, not series, not episode)
- Not primarily for children
- Independent, auteur, or festival-oriented
- Not already in the catalog or discovery staging
- Standalone theatrical or festival release
- Enough reliable sources to verify identity

Do NOT write: synopsis, the_mood, techniques, festival recognitions, Light/Shadow/Sci-Fi, posters, trailers, availability.

Exclusion list (${counts.total} titles: ${counts.films} films, ${counts.staging} staging, ${counts.workflow_round} this run):
Do not propose any film appearing in the exclusion list. Check both English and original titles, including translated and alternative spellings.
${exclusionListText || "- (empty)"}

Round: ${options.round ?? 1} of ${DISCOVERY_MAX_RESEARCH_ROUNDS}

Return ONLY valid JSON:
{
  "candidates": [
    {
      "title": string,
      "original_title": string | null,
      "year": number,
      "directors": string[],
      "countries": string[],
      "runtime_minutes": number | null,
      "source_urls": string[],
      "researcher_why": string,
      "manager_why": string,
      "requirement_evidence": {
        "full_length_feature": string,
        "fully_animated": string,
        "no_live_action_or_archive": string,
        "not_children_oriented": string,
        "independent_auteur_or_festival": string,
        "not_in_catalog": string,
        "standalone_release": string,
        "reliable_sources": string
      }
    }
  ]
}
`.trim();
}

/**
 * Identity duplicate against a list of film-like rows (Unicode-safe).
 * Fuzzy matches are returned as needsAdditionalCheck — not automatic rejects.
 *
 * @param {{ title: string, original_title?: string | null, year: number, source_urls?: string[] }} candidate
 * @param {Array<object>} catalog
 */
export function findCatalogIdentityDuplicate(candidate, catalog) {
  const index = (catalog ?? []).map((film) =>
    buildExclusionEntry(film, {
      source: film.source ?? EXCLUSION_ENTRY_SOURCE.films,
      reject_reason: film.reject_reason ?? null,
      exclusion_mode: film.exclusion_mode,
      source_urls: film.source_urls,
    })
  );
  const { hard, fuzzy } = matchAgainstExclusionIndex(candidate, index);
  if (hard) {
    return {
      kind: hard.kind,
      film: hard.entry,
      needsAdditionalCheck: false,
    };
  }
  if (fuzzy) {
    return {
      kind: fuzzy.kind,
      film: fuzzy.entry,
      similarity: fuzzy.similarity,
      needsAdditionalCheck: true,
    };
  }
  return null;
}

/**
 * Deterministic eligibility checks (Reviewer must not blindly trust Researcher).
 *
 * @param {import("./film-discovery.mjs").ResearcherCandidate} candidate
 * @param {{
 *   catalogFilms?: object[],
 *   existingCandidates?: object[],
 *   exclusionIndex?: object[],
 *   minRuntimeMinutes?: number,
 * }} [options]
 * @returns {import("./film-discovery.mjs").EligibilityReview}
 */
export function reviewCandidateEligibility(candidate, options = {}) {
  const reasons = [];
  const missing = [];
  const fix_hints = [];
  const minRuntime =
    options.minRuntimeMinutes ?? DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES;

  if (!researcherRequiresSources(candidate)) {
    reasons.push("No reliable source URLs provided");
    missing.push("source_urls");
    fix_hints.push("Add at least one http(s) source URL that verifies the film");
  }

  if (!candidate.directors?.length) {
    reasons.push("Directors missing");
    missing.push("directors");
    fix_hints.push("Confirm director(s) from sources");
  }

  if (!candidate.countries?.length) {
    reasons.push("Countries missing");
    missing.push("countries");
    fix_hints.push("Confirm country/countries from sources");
  }

  if (candidate.runtime_minutes == null) {
    reasons.push("Runtime missing");
    missing.push("runtime_minutes");
    fix_hints.push("Provide feature runtime in minutes from sources");
  } else if (candidate.runtime_minutes < minRuntime) {
    reasons.push(
      `Runtime ${candidate.runtime_minutes}m is below feature minimum ${minRuntime}m`
    );
    fix_hints.push("Replace with a full-length feature, not a short");
  }

  const exclusionIndex =
    options.exclusionIndex ??
    [
      ...(options.catalogFilms ?? []).map((film) =>
        buildExclusionEntry(film, { source: EXCLUSION_ENTRY_SOURCE.films })
      ),
      ...(options.existingCandidates ?? []).map((film) =>
        buildExclusionEntry(film, {
          source:
            film.source ?? EXCLUSION_ENTRY_SOURCE.discoveryCandidates,
          reject_reason: film.reject_reason ?? null,
          exclusion_mode: film.exclusion_mode,
          source_urls: film.source_urls,
        })
      ),
    ];

  const { hard, fuzzy } = matchAgainstExclusionIndex(
    candidate,
    exclusionIndex
  );

  /** @type {object | null} */
  let matched_record = null;
  /** @type {string | null} */
  let reason_code = null;

  if (hard) {
    reason_code = DISCOVERY_REJECT_REASON.duplicate;
    matched_record = buildMatchedRecord(hard);
    reasons.push(DISCOVERY_REJECT_REASON.duplicate);
    reasons.push(
      `Duplicate of existing title (${hard.kind}): ${hard.entry.title ?? "unknown"} [${hard.entry.source}]`
    );
    fix_hints.push("Pick a film not already in catalog or active review");
  } else if (fuzzy || candidate.fuzzy_needs_review) {
    const flag = fuzzy ?? {
      kind: candidate.fuzzy_needs_review.kind,
      entry: {
        title: candidate.fuzzy_needs_review.matched?.title,
        year: candidate.fuzzy_needs_review.matched?.year,
        source: candidate.fuzzy_needs_review.matched?.source,
      },
      similarity: candidate.fuzzy_needs_review.similarity,
    };
    // Fuzzy alone does not FAIL — additional verification signal only.
    fix_hints.push(
      `Fuzzy title similarity needs additional verification vs "${flag.entry.title}" (${flag.entry.year}) [${flag.entry.source}]`
    );
  }

  for (const key of REQUIRED_EVIDENCE_KEYS) {
    const text = candidate.requirement_evidence?.[key];
    if (!text || !String(text).trim()) {
      reasons.push(`Missing requirement evidence: ${key}`);
      missing.push(`requirement_evidence.${key}`);
      fix_hints.push(`Provide concrete evidence for ${key}`);
    }
  }

  if (!candidate.researcher_why?.trim()) {
    reasons.push("researcher_why missing");
    missing.push("researcher_why");
  }

  if (!candidate.manager_why?.trim()) {
    reasons.push("manager_why missing");
    missing.push("manager_why");
  }

  const result =
    reasons.length === 0
      ? DISCOVERY_ELIGIBILITY.pass
      : DISCOVERY_ELIGIBILITY.fail;

  return {
    result,
    reasons,
    missing,
    fix_hints,
    reason_code,
    matched_record,
    evidence: {
      source_url_count: candidate.source_urls?.length ?? 0,
      runtime_minutes: candidate.runtime_minutes,
      duplicate: matched_record,
      fuzzy_needs_review: fuzzy
        ? {
            kind: fuzzy.kind,
            similarity: fuzzy.similarity,
            title: fuzzy.entry.title,
            year: fuzzy.entry.year,
            source: fuzzy.entry.source,
          }
        : candidate.fuzzy_needs_review ?? null,
      normalized_title: normalizeDiscoveryIdentityString(candidate.title),
      normalized_original_title: normalizeDiscoveryIdentityString(
        candidate.original_title
      ),
    },
  };
}

/**
 * Optional LLM second opinion. Failures from deterministic review always win.
 * @param {import("./film-discovery.mjs").EligibilityReview} deterministic
 * @param {import("./film-discovery.mjs").EligibilityReview | null | undefined} llmReview
 */
export function mergeEligibilityReviews(deterministic, llmReview) {
  if (deterministic.result === DISCOVERY_ELIGIBILITY.fail) {
    return deterministic;
  }
  if (!llmReview) return deterministic;
  if (llmReview.result === DISCOVERY_ELIGIBILITY.fail) {
    return {
      result: DISCOVERY_ELIGIBILITY.fail,
      reasons: [
        ...deterministic.reasons,
        ...llmReview.reasons.map((reason) => `LLM: ${reason}`),
      ],
      missing: [...new Set([...deterministic.missing, ...llmReview.missing])],
      fix_hints: [
        ...new Set([...deterministic.fix_hints, ...llmReview.fix_hints]),
      ],
      reason_code: llmReview.reason_code ?? deterministic.reason_code,
      matched_record: llmReview.matched_record ?? deterministic.matched_record,
      evidence: { ...deterministic.evidence, llm: llmReview.evidence },
    };
  }
  return {
    ...deterministic,
    reasons: [
      ...deterministic.reasons,
      ...(llmReview.reasons ?? []).map((reason) => `LLM: ${reason}`),
    ],
    evidence: { ...deterministic.evidence, llm: llmReview.evidence },
  };
}

/**
 * @param {object} options
 * @param {import("./film-discovery.mjs").ManagerBrief} options.brief
 * @param {import("./film-discovery.mjs").ResearcherCandidate} options.candidate
 */
export function buildEligibilityPrompt(options) {
  return `
You are Eligibility reviewer for Resonale. Independently verify this candidate.
Do NOT trust the Researcher conclusion without checking evidence.
Independently re-check duplicates against catalog and staging.

Manager brief:
${formatManagerBrief(options.brief)}

Candidate JSON:
${JSON.stringify(options.candidate, null, 2)}

Checks:
- full-length feature film
- 100% animation, no live-action/archive inserts
- not children-oriented
- independent / auteur / festival
- not already in catalog / staging
- title/original_title/year/directors/countries/runtime supported by sources
- matches Manager brief

Return ONLY JSON:
{
  "result": "PASS" | "FAIL",
  "reasons": string[],
  "missing": string[],
  "fix_hints": string[]
}
`.trim();
}

/**
 * Cap research rounds at 3.
 * @param {number} round
 */
export function clampResearchRound(round) {
  if (!Number.isInteger(round) || round < 1) return 1;
  return Math.min(round, DISCOVERY_MAX_RESEARCH_ROUNDS);
}

/**
 * After FAIL set, how many more candidates are needed.
 * @param {number} passedCount
 * @param {number} [target]
 */
export function remainingCandidatesNeeded(
  passedCount,
  target = DISCOVERY_TARGET_CANDIDATE_COUNT
) {
  return Math.max(0, target - passedCount);
}

/**
 * Incomplete batch is allowed only after the third round.
 * @param {{ round: number, passedCount: number, target?: number, maxRounds?: number }} input
 */
export function allowIncompleteBatch(input) {
  const target = input.target ?? DISCOVERY_TARGET_CANDIDATE_COUNT;
  const maxRounds = input.maxRounds ?? DISCOVERY_MAX_RESEARCH_ROUNDS;
  return (
    input.round >= maxRounds && input.passedCount < target
  );
}

export { REQUIRED_EVIDENCE_KEYS, DISCOVERY_DEFAULTS };
