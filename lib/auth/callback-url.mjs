/**
 * @param {string} siteUrl
 * @returns {string}
 */
export function getAuthCallbackUrl(siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/auth/callback`;
}

/**
 * @param {string | null | undefined} siteUrl
 * @param {string | null | undefined} origin
 * @returns {string}
 */
export function resolveSiteUrl(siteUrl, origin) {
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }

  if (origin) {
    return origin.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}
