import { sanitizeNextPath } from "./callback-origin.mjs";

export const AUTH_NEXT_PATH_COOKIE_NAME = "animationpre-auth-next";

/**
 * @param {string} nextPath
 */
export function storeAuthNextPathCookie(nextPath) {
  if (typeof document === "undefined") {
    return;
  }

  const value = encodeURIComponent(sanitizeNextPath(nextPath));
  document.cookie = `${AUTH_NEXT_PATH_COOKIE_NAME}=${value}; Path=/; Max-Age=3600; SameSite=Lax`;
}

/**
 * @param {Array<{ name: string; value: string }>} cookies
 * @returns {string | null}
 */
export function readAuthNextPathFromCookies(cookies) {
  const cookie = cookies.find((entry) => entry.name === AUTH_NEXT_PATH_COOKIE_NAME);

  if (!cookie?.value) {
    return null;
  }

  try {
    return sanitizeNextPath(decodeURIComponent(cookie.value));
  } catch {
    return null;
  }
}

/**
 * @param {string | null} nextParam
 * @param {Array<{ name: string; value: string }>} cookies
 * @returns {string}
 */
// Saved and Watched are views on /, not separate routes.
const RETIRED_PATH_PREFIXES = [
  "/p/",
  "/films",
  "/my-profile",
  "/account",
  "/saved",
  "/watched",
];

/**
 * Replace retired user-facing paths with / so that legacy URLs stored in
 * cookies or magic-link ?next= params are silently discarded.
 *
 * @param {string} path
 * @returns {string}
 */
function sanitizeRetiredPath(path) {
  if (RETIRED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix)
  )) {
    return "/";
  }

  return path;
}

export function resolveAuthCallbackNextPath(nextParam, cookies) {
  if (nextParam) {
    return sanitizeRetiredPath(sanitizeNextPath(nextParam));
  }

  const fromCookie = readAuthNextPathFromCookies(cookies);
  if (fromCookie) {
    return sanitizeRetiredPath(fromCookie);
  }

  return sanitizeNextPath(null);
}
