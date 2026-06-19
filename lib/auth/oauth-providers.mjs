/** @typedef {'apple' | 'google'} OAuthProvider */

const ALLOWED_PROVIDERS = new Set(["apple", "google"]);

/**
 * @param {string | undefined | null} envValue
 * @returns {OAuthProvider[]}
 */
export function parseOAuthProviders(envValue) {
  if (!envValue?.trim()) {
    return [];
  }

  const seen = new Set();

  return envValue
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => {
      if (!ALLOWED_PROVIDERS.has(value) || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

/**
 * @param {string | undefined | null} envValue
 * @returns {OAuthProvider[]}
 */
export function resolveOAuthProviders(envValue) {
  return parseOAuthProviders(envValue);
}

/**
 * @param {OAuthProvider} provider
 * @returns {string}
 */
export function getOAuthSignInLabel(provider) {
  if (provider === "apple") {
    return "Sign in with Apple";
  }

  return "Sign in with Google";
}
