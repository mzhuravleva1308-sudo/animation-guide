/**
 * Early-access gate for free-form vibe search on the catalog.
 */

export const VIBE_SEARCH_ALLOWLIST_EMAILS = Object.freeze([
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
export function canAccessVibeSearch(email) {
  const normalized = normalizeAllowlistEmail(email);
  if (!normalized) return false;
  return VIBE_SEARCH_ALLOWLIST_EMAILS.includes(normalized);
}
