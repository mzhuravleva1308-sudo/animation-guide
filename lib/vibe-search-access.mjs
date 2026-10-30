/**
 * Access gate for free-form vibe / AI search on the catalog.
 * Available to every signed-in viewer (allowlist retired).
 */

/** @deprecated Allowlist retired; AI Search is generally available when signed in. */
export const VIBE_SEARCH_ALLOWLIST_EMAILS = Object.freeze([]);

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
  return Boolean(normalizeAllowlistEmail(email));
}
