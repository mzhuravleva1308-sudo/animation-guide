/**
 * Weekly film discovery — shared constants and types.
 *
 * Lifecycle (staging only, never public catalog):
 *   pending_review → approved | rejected
 *
 * approved ≠ published ≠ enriched. Approve does not touch public.films.
 */

export const DISCOVERY_REVIEW_STATUS = Object.freeze({
  pendingReview: "pending_review",
  approved: "approved",
  rejected: "rejected",
});

export const DISCOVERY_ELIGIBILITY = Object.freeze({
  pass: "PASS",
  fail: "FAIL",
});

export const DISCOVERY_SOURCE = Object.freeze({
  weeklyDiscovery: "weekly_discovery",
  manualSeed: "manual_seed",
});

export const DISCOVERY_BATCH_STATUS = Object.freeze({
  running: "running",
  completed: "completed",
  completedIncomplete: "completed_incomplete",
  failed: "failed",
});

/**
 * reject_reason codes stored in film_discovery_candidates.reject_reason (free text column).
 * Prefer these codes so Researcher exclusion can classify permanent vs retriable.
 */
export const DISCOVERY_REJECT_REASON = Object.freeze({
  duplicate: "duplicate",
  notAnimation: "not_animation",
  hybridAnimation: "hybrid_animation",
  shortFilm: "short_film",
  seriesOrEpisode: "series_or_episode",
  primarilyForChildren: "primarily_for_children",
  notIndependentAuteurFestival: "not_independent_auteur_festival",
  insufficientSources: "insufficient_sources",
  metadataUnclear: "metadata_unclear",
  eligibilityUncertain: "eligibility_uncertain",
});

export const DISCOVERY_PERMANENT_REJECT_REASONS = Object.freeze([
  DISCOVERY_REJECT_REASON.duplicate,
  DISCOVERY_REJECT_REASON.notAnimation,
  DISCOVERY_REJECT_REASON.hybridAnimation,
  DISCOVERY_REJECT_REASON.shortFilm,
  DISCOVERY_REJECT_REASON.seriesOrEpisode,
  DISCOVERY_REJECT_REASON.primarilyForChildren,
  DISCOVERY_REJECT_REASON.notIndependentAuteurFestival,
]);

export const DISCOVERY_RETRIABLE_REJECT_REASONS = Object.freeze([
  DISCOVERY_REJECT_REASON.insufficientSources,
  DISCOVERY_REJECT_REASON.metadataUnclear,
  DISCOVERY_REJECT_REASON.eligibilityUncertain,
]);

/**
 * Extract a known reject code from free-text reject_reason.
 * @param {string | null | undefined} reason
 * @returns {string | null}
 */
export function parseRejectReasonCode(reason) {
  if (typeof reason !== "string" || !reason.trim()) return null;
  const trimmed = reason.trim();
  const known = new Set([
    ...DISCOVERY_PERMANENT_REJECT_REASONS,
    ...DISCOVERY_RETRIABLE_REJECT_REASONS,
  ]);
  if (known.has(trimmed)) return trimmed;
  const head = trimmed.split(/[:;\s]/)[0];
  if (known.has(head)) return head;
  return null;
}

/**
 * @param {string | null | undefined} reason
 */
export function isPermanentRejectReason(reason) {
  const code = parseRejectReasonCode(reason);
  if (code) return DISCOVERY_PERMANENT_REJECT_REASONS.includes(code);
  // Unknown / free-text reasons are treated as permanent (do not re-propose).
  return typeof reason === "string" && reason.trim().length > 0;
}

/**
 * @param {string | null | undefined} reason
 */
export function isRetriableRejectReason(reason) {
  const code = parseRejectReasonCode(reason);
  return Boolean(code && DISCOVERY_RETRIABLE_REJECT_REASONS.includes(code));
}

/** Max Researcher search rounds (initial + 2 retries). */
export const DISCOVERY_MAX_RESEARCH_ROUNDS = 3;

/** Target confirmed candidates per weekly batch. */
export const DISCOVERY_TARGET_CANDIDATE_COUNT = 10;

/** Minimum runtime minutes for a feature film (Academy feature threshold). */
export const DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES = 40;

export const DISCOVERY_DEFAULTS = Object.freeze({
  model: "gpt-4o-mini",
  targetCount: DISCOVERY_TARGET_CANDIDATE_COUNT,
  maxRounds: DISCOVERY_MAX_RESEARCH_ROUNDS,
  minFeatureRuntimeMinutes: DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES,
});

/**
 * @typedef {object} ManagerBrief
 * @property {string[]} priorityCountries
 * @property {string[]} priorityYearsOrDecades
 * @property {string[]} priorityGenresOrThemes
 * @property {string[]} priorityTechniques
 * @property {string[]} overrepresented
 * @property {string[]} underrepresented
 * @property {string[]} batchRequirements
 * @property {string} summary
 */

/**
 * @typedef {object} ResearcherCandidate
 * @property {string} title
 * @property {string | null} [original_title]
 * @property {number} year
 * @property {string[]} directors
 * @property {string[]} countries
 * @property {number | null} [runtime_minutes]
 * @property {string[]} source_urls
 * @property {string} researcher_why
 * @property {string} manager_why
 * @property {Record<string, string>} requirement_evidence
 * @property {object} [fuzzy_needs_review]
 */

/**
 * @typedef {object} EligibilityReview
 * @property {'PASS' | 'FAIL'} result
 * @property {string[]} reasons
 * @property {string[]} missing
 * @property {string[]} fix_hints
 * @property {string | null} [reason_code]
 * @property {object | null} [matched_record]
 * @property {Record<string, unknown>} [evidence]
 */

/**
 * @param {string | Date} [date]
 */
export function discoveryWeekKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const dayNum = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  const week = Math.ceil((dayNum + start.getUTCDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
