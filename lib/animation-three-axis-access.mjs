/**
 * Early-access gate for animation native_3axis ranking
 * (mood + material + storytelling).
 */

export const ANIMATION_THREE_AXIS_ALLOWLIST_EMAILS = Object.freeze([
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
export function canAccessAnimationThreeAxis(email) {
  const normalized = normalizeAllowlistEmail(email);
  if (!normalized) return false;
  return ANIMATION_THREE_AXIS_ALLOWLIST_EMAILS.includes(normalized);
}
