import { POST_AUTH_PATH } from "./post-auth-path.mjs";

/**
 * @param {string | null | undefined} next
 * @returns {string}
 */
export function sanitizeNextPath(next) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return POST_AUTH_PATH;
  }

  return next;
}

/**
 * Resolve the auth origin for redirect URLs. Prefer the live browser or
 * request origin so magic-link callbacks land on the same host that initiated
 * sign-in (localhost vs 127.0.0.1, staging vs production). Fall back to
 * NEXT_PUBLIC_SITE_URL only when no origin is available.
 *
 * @param {string | null | undefined} origin
 * @param {string | null | undefined} configuredSiteUrl
 * @returns {string}
 */
export function resolveAuthOrigin(origin, configuredSiteUrl) {
  if (origin) {
    return origin.replace(/\/$/, "");
  }

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

/**
 * @param {Request} request
 * @param {string | null | undefined} configuredSiteUrl
 * @returns {string}
 */
export function resolveAuthOriginFromRequest(request, configuredSiteUrl) {
  const host =
    request.headers?.get("x-forwarded-host") ??
    request.headers?.get("host");

  if (host) {
    const forwardedProto = request.headers?.get("x-forwarded-proto");
    const protocol =
      forwardedProto ??
      (request.nextUrl?.protocol
        ? request.nextUrl.protocol.replace(/:$/, "")
        : new URL(request.url).protocol.replace(/:$/, ""));

    return resolveAuthOrigin(`${protocol}://${host}`, configuredSiteUrl);
  }

  if (request.nextUrl?.host) {
    return resolveAuthOrigin(request.nextUrl.origin, configuredSiteUrl);
  }

  return resolveAuthOrigin(new URL(request.url).origin, configuredSiteUrl);
}
