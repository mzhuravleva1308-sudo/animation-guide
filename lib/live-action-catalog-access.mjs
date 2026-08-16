/**
 * Live-action Films catalog is available to all signed-in catalog viewers.
 * Kept as a named helper so call sites stay explicit.
 */

/**
 * @param {unknown} _email
 */
export function normalizeAllowlistEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} [_email]
 */
export function canAccessLiveActionCatalog(_email) {
  return true;
}

/** @deprecated Allowlist retired; Films is generally available. */
export const LIVE_ACTION_CATALOG_ALLOWLIST_EMAILS = Object.freeze([]);
