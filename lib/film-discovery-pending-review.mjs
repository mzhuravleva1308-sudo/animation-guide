/**
 * Split pending_review candidates into attention vs looks-good for admin review.
 */

import { normalizeFilmString } from "./film-duplicate-check.mjs";
import {
  DISCOVERY_CHILDREN_AUDIENCE_TAG_LABEL,
  discoveryRowPrimarilyForChildren,
} from "./film-discovery-children-audience.mjs";

export const DISCOVERY_PENDING_REVIEW_BUCKET = Object.freeze({
  needsAttention: "needs_attention",
  looksGood: "looks_good",
});

/** Same title/original, year off by at most this many years → careful look. */
export const DISCOVERY_NEAR_DUPLICATE_MAX_YEAR_DELTA = 1;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasTags(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function identityNorm(value) {
  return normalizeFilmString(value ?? "");
}

/**
 * Catalog rows that share title/original identity but not necessarily the same year.
 * Exact-year matches are included too (seed should have blocked them; flag if they slipped in).
 *
 * @param {{
 *   title?: string | null,
 *   original_title?: string | null,
 *   normalized_title?: string | null,
 *   normalized_original_title?: string | null,
 *   year?: number | null,
 * }} candidate
 * @param {Array<{
 *   id?: string | null,
 *   title?: string | null,
 *   original_title?: string | null,
 *   normalized_title?: string | null,
 *   normalized_original_title?: string | null,
 *   year?: number | null,
 * }>} catalogFilms
 * @param {{ maxYearDelta?: number }} [options]
 * @returns {Array<{
 *   id: string | null,
 *   title: string,
 *   year: number,
 *   match: string,
 *   year_delta: number,
 * }>}
 */
export function findNearCatalogDuplicates(candidate, catalogFilms, options = {}) {
  // Already linked to a catalog row — not a review near-dupe signal.
  if (candidate?.film_id) return [];

  const maxYearDelta =
    options.maxYearDelta ?? DISCOVERY_NEAR_DUPLICATE_MAX_YEAR_DELTA;
  const candYear = Number(candidate?.year);
  if (!Number.isInteger(candYear)) return [];

  const titleNorm =
    identityNorm(candidate?.normalized_title) ||
    identityNorm(candidate?.title);
  const originalNorm =
    identityNorm(candidate?.normalized_original_title) ||
    identityNorm(candidate?.original_title);

  /** @type {ReturnType<typeof findNearCatalogDuplicates>} */
  const matches = [];

  for (const film of catalogFilms ?? []) {
    const filmYear = Number(film?.year);
    if (!Number.isInteger(filmYear)) continue;
    const year_delta = Math.abs(filmYear - candYear);
    if (year_delta > maxYearDelta) continue;

    const filmTitleNorm =
      identityNorm(film?.normalized_title) || identityNorm(film?.title);
    const filmOriginalNorm =
      identityNorm(film?.normalized_original_title) ||
      identityNorm(film?.original_title);

    /** @type {string | null} */
    let match = null;
    if (titleNorm && filmTitleNorm && titleNorm === filmTitleNorm) {
      match = "title";
    } else if (
      originalNorm &&
      filmOriginalNorm &&
      originalNorm === filmOriginalNorm
    ) {
      match = "original_title";
    } else if (titleNorm && filmOriginalNorm && titleNorm === filmOriginalNorm) {
      match = "title_matches_original";
    } else if (
      originalNorm &&
      filmTitleNorm &&
      originalNorm === filmTitleNorm
    ) {
      match = "original_matches_title";
    }
    if (!match) continue;

    matches.push({
      id: film?.id ? String(film.id) : null,
      title: String(film?.title ?? "").trim() || "(untitled)",
      year: filmYear,
      match,
      year_delta,
    });
  }

  return matches.sort((a, b) => {
    if (a.year_delta !== b.year_delta) return a.year_delta - b.year_delta;
    return a.title.localeCompare(b.title);
  });
}

/**
 * @param {Array<{ title: string, year: number, match?: string, year_delta?: number }>} matches
 * @returns {string | null}
 */
export function formatNearCatalogDuplicateReason(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null;
  const top = matches.slice(0, 2).map((row) => {
    const delta =
      Number.isInteger(row.year_delta) && row.year_delta > 0
        ? `, year±${row.year_delta}`
        : "";
    const via = row.match ? `, ${row.match}` : "";
    return `"${row.title}" (${row.year}${via}${delta})`;
  });
  const more =
    matches.length > 2 ? ` +${matches.length - 2} more` : "";
  return `Possible catalog duplicate: ${top.join("; ")}${more}`;
}

/**
 * Attach near-dupe hints onto candidate rows (server load path).
 *
 * @template {object} T
 * @param {T[]} candidates
 * @param {object[]} catalogFilms
 * @param {{ maxYearDelta?: number }} [options]
 * @returns {(T & { possible_catalog_duplicates: ReturnType<typeof findNearCatalogDuplicates> })[]}
 */
export function annotateDiscoveryCandidatesWithNearDuplicates(
  candidates,
  catalogFilms,
  options = {}
) {
  return (candidates ?? []).map((row) => ({
    ...row,
    possible_catalog_duplicates: findNearCatalogDuplicates(
      row,
      catalogFilms,
      options
    ),
  }));
}

/**
 * Human-readable reasons why a pending candidate still needs a careful look.
 *
 * @param {{
 *   poster_url?: string | null,
 *   trailer_url?: string | null,
 *   media_status?: string | null,
 *   content_status?: string | null,
 *   moods?: unknown,
 *   aesthetic_tags?: unknown,
 *   storytelling_tags?: unknown,
 *   has_festival?: boolean | null,
 *   review_flags?: unknown,
 *   eligibility_evidence?: unknown,
 *   possible_catalog_duplicates?: Array<{
 *     title: string,
 *     year: number,
 *     match?: string,
 *     year_delta?: number,
 *   }> | null,
 * }} film
 * @returns {string[]}
 */
export function listDiscoveryPendingReviewAttentionReasons(film) {
  /** @type {string[]} */
  const reasons = [];
  if (!film?.poster_url) reasons.push("No poster");
  if (!film?.trailer_url) reasons.push("No trailer");

  const media = film?.media_status ?? "media_pending";
  if (media !== "media_complete") {
    reasons.push(`Media: ${media}`);
  }

  const content = film?.content_status ?? "pending";
  if (content !== "ready" && content !== "ready_with_note") {
    reasons.push(`Content: ${content}`);
  }

  if (!hasTags(film?.moods)) reasons.push("Missing moods");
  if (!hasTags(film?.aesthetic_tags)) reasons.push("Missing aesthetic tags");
  if (!hasTags(film?.storytelling_tags)) reasons.push("Missing plot tags");

  if (film?.has_festival !== true && film?.has_festival !== false) {
    reasons.push("Festival filter not assessed");
  }

  if (discoveryRowPrimarilyForChildren(film)) {
    reasons.push(DISCOVERY_CHILDREN_AUDIENCE_TAG_LABEL);
  }

  const nearDupReason = formatNearCatalogDuplicateReason(
    film?.possible_catalog_duplicates ?? []
  );
  if (nearDupReason) reasons.push(nearDupReason);

  return reasons;
}

/**
 * @param {Parameters<typeof listDiscoveryPendingReviewAttentionReasons>[0]} film
 * @returns {{
 *   bucket: typeof DISCOVERY_PENDING_REVIEW_BUCKET[keyof typeof DISCOVERY_PENDING_REVIEW_BUCKET],
 *   reasons: string[],
 * }}
 */
export function classifyDiscoveryPendingReview(film) {
  const reasons = listDiscoveryPendingReviewAttentionReasons(film);
  return {
    bucket: reasons.length
      ? DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention
      : DISCOVERY_PENDING_REVIEW_BUCKET.looksGood,
    reasons,
  };
}

/**
 * @template {object} T
 * @param {T[]} candidates
 * @returns {{
 *   needsAttention: T[],
 *   looksGood: T[],
 * }}
 */
export function partitionDiscoveryPendingReview(candidates) {
  /** @type {T[]} */
  const needsAttention = [];
  /** @type {T[]} */
  const looksGood = [];
  for (const row of candidates ?? []) {
    const { bucket } = classifyDiscoveryPendingReview(row);
    if (bucket === DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention) {
      needsAttention.push(row);
    } else {
      looksGood.push(row);
    }
  }
  return { needsAttention, looksGood };
}
