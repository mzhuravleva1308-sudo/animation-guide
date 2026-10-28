/**
 * Split pending_review candidates into attention vs looks-good for admin review.
 */

export const DISCOVERY_PENDING_REVIEW_BUCKET = Object.freeze({
  needsAttention: "needs_attention",
  looksGood: "looks_good",
});

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasTags(value) {
  return Array.isArray(value) && value.length > 0;
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
