import { POST_AUTH_PATH } from "./post-auth-path";

export function getAuthCallbackUrl(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const url = new URL("/auth/callback", `${base}/`);
  url.searchParams.set("next", POST_AUTH_PATH);
  return url.toString();
}

export function resolveSiteUrl(
  siteUrl?: string | null,
  origin?: string | null
): string {
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }

  if (origin) {
    return origin.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}
