import { POST_AUTH_PATH } from "./post-auth-path";
import type { NextRequest } from "next/server";

export function sanitizeNextPath(next?: string | null): string {
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
 */
export function resolveAuthOrigin(
  origin?: string | null,
  configuredSiteUrl?: string | null
): string {
  if (origin) {
    return origin.replace(/\/$/, "");
  }

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

export function resolveAuthOriginFromRequest(
  request: NextRequest | Request,
  configuredSiteUrl?: string | null
): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (host) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const protocol =
      forwardedProto ??
      ("nextUrl" in request
        ? request.nextUrl.protocol.replace(/:$/, "")
        : new URL(request.url).protocol.replace(/:$/, ""));

    return resolveAuthOrigin(`${protocol}://${host}`, configuredSiteUrl);
  }

  if ("nextUrl" in request && request.nextUrl?.host) {
    return resolveAuthOrigin(request.nextUrl.origin, configuredSiteUrl);
  }

  return resolveAuthOrigin(new URL(request.url).origin, configuredSiteUrl);
}
