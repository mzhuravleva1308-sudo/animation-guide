/** @typedef {{ name: string; value: string }} NamedCookie */

/**
 * Persistent auth cookies so sessions survive browser quit / reboot.
 * Matches @supabase/ssr DEFAULT_COOKIE_OPTIONS (400 days).
 */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  maxAge: 400 * 24 * 60 * 60,
};

/**
 * @param {string} name
 */
export function isSupabaseAuthTokenCookie(name) {
  // `sb-…-auth-token` / `sb-…-auth-token.0` — not `…-auth-token-code-verifier`.
  return /auth-token(?:\.\d+)?$/.test(name);
}

/**
 * True when setAll is wiping the whole auth session (failed refresh / sign-out),
 * not merely trimming chunk cookies after a successful rotation.
 *
 * @param {NamedCookie[]} cookies
 */
export function isClearingAllAuthTokenCookies(cookies) {
  const authCookies = cookies.filter((cookie) =>
    isSupabaseAuthTokenCookie(cookie.name)
  );
  return (
    authCookies.length > 0 && authCookies.every((cookie) => !cookie.value)
  );
}
