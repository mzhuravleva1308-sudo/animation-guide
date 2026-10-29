/**
 * Build the auth callback path used to take over a browser session as a user.
 * Mirrors e2e magic-link sign-in (token_hash + type=email).
 */
export function buildImpersonationCallbackPath(hashedToken, nextPath = "/") {
  if (typeof hashedToken !== "string" || !hashedToken.trim()) {
    throw new Error("hashedToken is required");
  }

  const next =
    typeof nextPath === "string" && nextPath.startsWith("/") ? nextPath : "/";

  const params = new URLSearchParams({
    token_hash: hashedToken.trim(),
    type: "email",
    next,
  });

  return `/auth/callback?${params.toString()}`;
}
