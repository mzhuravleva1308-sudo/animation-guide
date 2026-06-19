import { POST_AUTH_PATH } from "./post-auth-path";

export function sanitizeNextPath(next?: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return POST_AUTH_PATH;
  }

  return next;
}

/**
 * Resolve the canonical auth origin. When NEXT_PUBLIC_SITE_URL is set, all
 * magic-link redirects and callback responses use that host. Otherwise the
 * current request/browser origin is used as-is so PKCE cookies stay aligned.
 */
export function resolveAuthOrigin(
  origin: string,
  configuredSiteUrl?: string | null
): string {
  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, "");
  }

  return origin.replace(/\/$/, "");
}

export function resolveAuthOriginFromRequest(
  request: Request,
  configuredSiteUrl?: string | null
): string {
  return resolveAuthOrigin(new URL(request.url).origin, configuredSiteUrl);
}
