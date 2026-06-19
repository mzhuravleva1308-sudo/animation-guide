import { POST_AUTH_PATH } from "./post-auth-path.mjs";

/**
 * @param {string} siteUrl
 * @returns {string}
 */
export function getAuthCallbackUrl(siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  const url = new URL("/auth/callback", `${base}/`);
  url.searchParams.set("next", POST_AUTH_PATH);
  return url.toString();
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
