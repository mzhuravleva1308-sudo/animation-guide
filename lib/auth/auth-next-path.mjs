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
export function resolveAuthCallbackNextPath(nextParam, cookies) {
  if (nextParam) {
    return sanitizeNextPath(nextParam);
  }

  return readAuthNextPathFromCookies(cookies) ?? sanitizeNextPath(null);
}
