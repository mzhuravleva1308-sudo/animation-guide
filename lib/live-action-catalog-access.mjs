/**
 * Early-access gate for the live-action Films catalog tab.
 * Scoring/schema can exist for all profiles; UI exposure is allowlisted.
 */

export const LIVE_ACTION_CATALOG_ALLOWLIST_EMAILS = Object.freeze([
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
export function canAccessLiveActionCatalog(email) {
  const normalized = normalizeAllowlistEmail(email);
  if (!normalized) return false;
  return LIVE_ACTION_CATALOG_ALLOWLIST_EMAILS.includes(normalized);
}
