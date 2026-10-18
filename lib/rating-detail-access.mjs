/**
 * Early-access gate for per-axis rating detail (visual / mood / plot).
 */

export const RATING_DETAIL_ALLOWLIST_EMAILS = Object.freeze([
  "mzhuravleva1308@gmail.com",
]);

/**
 * @param {unknown} email
 */
export function normalizeAllowlistEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} email
 */
export function canAccessRatingDetail(email) {
  const normalized = normalizeAllowlistEmail(email);
  if (!normalized) return false;
  return RATING_DETAIL_ALLOWLIST_EMAILS.includes(normalized);
}
