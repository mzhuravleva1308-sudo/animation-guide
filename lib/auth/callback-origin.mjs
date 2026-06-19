/**
 * @param {string | null | undefined} next
 * @returns {string}
 */
export function sanitizeNextPath(next) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

/**
 * Resolve the canonical auth origin. When NEXT_PUBLIC_SITE_URL is set, all
 * magic-link redirects and callback responses use that host. Otherwise the
 * current request/browser origin is used as-is so PKCE cookies stay aligned.
 *
 * @param {string} origin
 * @param {string | null | undefined} configuredSiteUrl
 * @returns {string}
 */
export function resolveAuthOrigin(origin, configuredSiteUrl) {
  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, "");
  }

  return origin.replace(/\/$/, "");
}

/**
 * @param {Request} request
 * @param {string | null | undefined} configuredSiteUrl
 * @returns {string}
 */
export function resolveAuthOriginFromRequest(request, configuredSiteUrl) {
  return resolveAuthOrigin(new URL(request.url).origin, configuredSiteUrl);
}
