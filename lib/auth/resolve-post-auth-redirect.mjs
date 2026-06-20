import { sanitizeNextPath } from "./callback-origin.mjs";
import { buildProfileGuidePathFromProfile } from "./profile-guide-url.mjs";

/**
 * @param {string | null | undefined} authCallbackType
 * @returns {boolean}
 */
export function isSignupAuthCallbackType(authCallbackType) {
  return authCallbackType?.trim().toLowerCase() === "signup";
}

/**
 * @param {{
 *   profile: { slug: string; share_token: string };
 *   nextPath: string;
 *   hadPendingAction: boolean;
 *   authCallbackType: string | null | undefined;
 * }} input
 * @returns {string}
 */
export function resolvePostAuthRedirectPath({
  profile,
  nextPath,
  hadPendingAction,
  authCallbackType,
}) {
  const safeNextPath = sanitizeNextPath(nextPath);

  if (hadPendingAction || isSignupAuthCallbackType(authCallbackType)) {
    return buildProfileGuidePathFromProfile(profile);
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
