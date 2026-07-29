import { sanitizeNextPath } from "./callback-origin.mjs";

/**
 * @param {string | null | undefined} authCallbackType
 * @returns {boolean}
 */
export function isSignupAuthCallbackType(authCallbackType) {
  return authCallbackType?.trim().toLowerCase() === "signup";
}

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
 * @param {string} path
 * @returns {boolean}
 */
function isRetiredPath(path) {
  return RETIRED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix)
  );
}

/**
 * @param {{
 *   nextPath: string;
 *   hadPendingAction: boolean;
 *   authCallbackType: string | null | undefined;
 * }} input
 * @returns {string}
 */
export function resolvePostAuthRedirectPath({
  nextPath,
  hadPendingAction,
  authCallbackType,
}) {
  if (hadPendingAction || isSignupAuthCallbackType(authCallbackType)) {
    return "/";
  }

  const safeNextPath = sanitizeNextPath(nextPath);

  if (isRetiredPath(safeNextPath)) {
    return "/";
  }

  return safeNextPath;
}

/**
 * @param {string} path
 * @param {string} message
 * @param {string} authErrorCode
 * @returns {string}
 */
export function appendAuthCallbackErrorToPath(path, message, authErrorCode) {
  const [pathnameAndSearch, hash = ""] = path.split("#", 2);
  const [pathname, search = ""] = pathnameAndSearch.split("?", 2);
  const params = new URLSearchParams(search);

  params.set("error", message);
  params.set("auth_error", authErrorCode);

  const query = params.toString();
  const nextPath = query ? `${pathname}?${query}` : pathname;

  return hash ? `${nextPath}#${hash}` : nextPath;
}
