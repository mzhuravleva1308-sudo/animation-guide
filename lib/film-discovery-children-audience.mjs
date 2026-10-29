/**
 * Detect primarily-for-children animation on discovery staging.
 * Does not auto-reject — flags for careful admin review.
 */

export const DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN =
  "primarily_for_children";

/** Near-duplicate suspicion vs public catalog (year±1 title/original match). */
export const DISCOVERY_REVIEW_FLAG_POSSIBLE_CATALOG_DUPLICATE =
  "possible_catalog_duplicate";

export const DISCOVERY_CHILDREN_AUDIENCE_TAG_LABEL =
  "Kids / youth";

/** Ages in title/section that mean a children's / family-kids screening (≤12). */
const CHILD_AGE_MARKER =
  /(?:^|[^\d])(?:3|4|5|6|7|8|9|10|11|12)\s*\+(?:\s*(?:yrs?|years?))?(?!\d)/i;

/**
 * Teen/adult age ratings (14+) alone are not enough — e.g. Poe anthology
 * "Extraordinary Tales (Age: 14+)". Youth programs / teen cartoons still flag via
 * other signals below.
 */
const TEEN_OR_ADULT_AGE_MARKER =
  /(?:^|[^\d])(?:1[4-9]|[2-9]\d)\s*\+/i;

const FAMILY_KIDS_SECTION =
  /\bfamily\s*program\b|\bfilms?\s+for\s+children\b|\bchildren'?s?\s+(?:film|movie|competition|programme|program)\b|\bkids?\s+(?:film|movie|program)\b|\bfor\s+children\b|\bpreschool\b|\byouth\s+(?:program|competition|film|section)\b|\bfilms?\s+for\s+(?:youth|teens?|young\s+people)\b|\bteen\s+program\b/i;

const CHILDREN_AUDIENCE_COPY =
  /\b(?:primarily\s+)?(?:for|aimed\s+at)\s+children\b|\bchildren'?s\s+audience\b|\bkids?\s+audience\b|\bfamily\s+audience\b|\bpreschool\b|\byoung\s+viewers\b|\btarget\s+audience\s*:\s*children\b/i;

/** Explicit youth / teen target audience (not merely a teen protagonist). */
const YOUTH_AUDIENCE_COPY =
  /\b(?:primarily\s+)?(?:for|aimed\s+at)\s+(?:teens?|teenagers?|tweens?|youth|young\s+(?:audiences?|viewers?|people))\b|\byouth\s+audience\b|\bteen(?:age)?\s+audience\b|\btarget\s+audience\s*:\s*(?:teens?|teenagers?|youth|young)\b/i;

/**
 * Teen-facing commercial cartoon signals (e.g. Ternet Ninja / Checkered Ninja):
 * teen protagonist language + light commercial genre stack, not drama/doc.
 */
const TEEN_PROTAGONIST_COPY =
  /\bteen(?:age(?:rs?)?)?\s+(?:boy|girl|kid|protagonist|hero|heroine)\b|\bteenage\b|\btween\b/i;

const COMMERCIAL_YOUTH_GENRES = new Set([
  "comedy",
  "adventure",
  "family",
  "fantasy",
]);

const NON_YOUTH_CARTOON_GENRES = new Set([
  "drama",
  "documentary",
  "war",
  "history",
  "crime",
  "thriller",
  "horror",
]);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeDiscoveryReviewFlags(value) {
  const raw = Array.isArray(value) ? value : [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const token = String(item ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * Prefer dedicated review_flags column; fall back to eligibility_evidence.review_flags
 * when the hosted migration is not applied yet.
 *
 * @param {{
 *   review_flags?: unknown,
 *   eligibility_evidence?: unknown,
 * } | null | undefined} row
 * @returns {string[]}
 */
export function getDiscoveryReviewFlags(row) {
  if (Array.isArray(row?.review_flags) && row.review_flags.length) {
    return normalizeDiscoveryReviewFlags(row.review_flags);
  }
  const evidence =
    row?.eligibility_evidence && typeof row.eligibility_evidence === "object"
      ? row.eligibility_evidence
      : null;
  if (evidence && Array.isArray(evidence.review_flags)) {
    return normalizeDiscoveryReviewFlags(evidence.review_flags);
  }
  if (Array.isArray(row?.review_flags)) {
    return normalizeDiscoveryReviewFlags(row.review_flags);
  }
  return [];
}

/**
 * @param {unknown} flags
 * @returns {boolean}
 */
export function discoveryHasPrimarilyForChildrenFlag(flags) {
  return normalizeDiscoveryReviewFlags(flags).includes(
    DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN
  );
}

/**
 * @param {{
 *   review_flags?: unknown,
 *   eligibility_evidence?: unknown,
 * } | null | undefined} row
 * @returns {boolean}
 */
export function discoveryRowPrimarilyForChildren(row) {
  return discoveryHasPrimarilyForChildrenFlag(getDiscoveryReviewFlags(row));
}

/**
 * Patch for writing kids flag without requiring review_flags column.
 * Merges into eligibility_evidence.review_flags; also sets review_flags when supported.
 *
 * @param {{
 *   review_flags?: unknown,
 *   eligibility_evidence?: unknown,
 * } | null | undefined} row
 * @returns {{
 *   review_flags: string[],
 *   eligibility_evidence: Record<string, unknown>,
 * }}
 */
export function buildPrimarilyForChildrenFlagPatch(row) {
  const evidence =
    row?.eligibility_evidence && typeof row.eligibility_evidence === "object"
      ? { ...row.eligibility_evidence }
      : {};
  const flags = withDiscoveryReviewFlag(
    getDiscoveryReviewFlags(row),
    DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN
  );
  evidence.review_flags = flags;
  evidence.primarily_for_children = true;
  return {
    review_flags: flags,
    eligibility_evidence: evidence,
  };
}

/**
 * @param {unknown} flags
 * @param {string} flag
 * @returns {string[]}
 */
export function withDiscoveryReviewFlag(flags, flag) {
  const next = normalizeDiscoveryReviewFlags(flags);
  const token = String(flag ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!token || next.includes(token)) return next;
  return [...next, token];
}

/**
 * @param {{
 *   title?: string | null,
 *   synopsis?: string | null,
 *   the_mood?: string | null,
 *   festival_section?: string | null,
 *   section?: string | null,
 *   tmdb_genres?: string[] | null,
 *   content_note?: string | null,
 * }} candidate
 * @returns {{
 *   primarily_for_children: boolean,
 *   reasons: string[],
 *   confidence: "high" | "medium" | "low",
 * }}
 */
export function assessDiscoveryChildrenAudience(candidate) {
  /** @type {string[]} */
  const reasons = [];
  const title = String(candidate?.title ?? "");
  const section = String(
    candidate?.festival_section ?? candidate?.section ?? ""
  );
  const copy = [
    title,
    candidate?.synopsis,
    candidate?.the_mood,
    candidate?.content_note,
    section,
  ]
    .map((part) => String(part ?? ""))
    .join("\n");

  const teenAgeOnly =
    TEEN_OR_ADULT_AGE_MARKER.test(title) &&
    !CHILD_AGE_MARKER.test(title) &&
    !CHILD_AGE_MARKER.test(section) &&
    !FAMILY_KIDS_SECTION.test(section);

  if (FAMILY_KIDS_SECTION.test(section)) {
    reasons.push(`Festival section looks kids/family/youth: ${section}`);
  }
  if (CHILD_AGE_MARKER.test(title) || CHILD_AGE_MARKER.test(section)) {
    reasons.push("Child age marker (≤12+) in title/section");
  }
  if (!teenAgeOnly && CHILDREN_AUDIENCE_COPY.test(copy)) {
    reasons.push("Copy signals children / family audience");
  }
  if (YOUTH_AUDIENCE_COPY.test(copy)) {
    reasons.push("Copy signals youth / teen audience");
  }

  const genres = Array.isArray(candidate?.tmdb_genres)
    ? candidate.tmdb_genres.map((g) => String(g))
    : [];
  const genreNames = genres.map((g) => g.toLowerCase());
  const hasAnimation = genreNames.includes("animation");
  const hasFamily = genreNames.includes("family");
  const hasCommercialYouthGenre = genreNames.some((g) =>
    COMMERCIAL_YOUTH_GENRES.has(g)
  );
  const hasNonYouthCartoonGenre = genreNames.some((g) =>
    NON_YOUTH_CARTOON_GENRES.has(g)
  );
  if (hasFamily && !teenAgeOnly) {
    reasons.push("TMDB genre includes Family");
  }

  const teenCartoon =
    hasAnimation &&
    hasCommercialYouthGenre &&
    !hasNonYouthCartoonGenre &&
    TEEN_PROTAGONIST_COPY.test(copy);
  if (teenCartoon) {
    reasons.push(
      "Teen-facing commercial cartoon (teen protagonist + light adventure/comedy stack)"
    );
  }

  const high =
    FAMILY_KIDS_SECTION.test(section) ||
    YOUTH_AUDIENCE_COPY.test(copy) ||
    (!teenAgeOnly &&
      (CHILD_AGE_MARKER.test(title) ||
        CHILD_AGE_MARKER.test(section) ||
        /\b(?:primarily\s+)?(?:for|aimed\s+at)\s+children\b|\bchildren'?s\s+audience\b|\bkids?\s+audience\b|\btarget\s+audience\s*:\s*children\b/i.test(
          copy
        )));

  const medium =
    !high && ((!teenAgeOnly && hasFamily) || teenCartoon);

  return {
    primarily_for_children: high || medium,
    reasons,
    confidence: high ? "high" : medium ? "medium" : "low",
  };
}
