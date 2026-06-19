export type OAuthProvider = "apple" | "google";

const ALLOWED_PROVIDERS = new Set<OAuthProvider>(["apple", "google"]);

export function parseOAuthProviders(
  envValue?: string | null
): OAuthProvider[] {
  if (!envValue?.trim()) {
    return [];
  }

  const seen = new Set<OAuthProvider>();

  return envValue
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is OAuthProvider => {
      if (!ALLOWED_PROVIDERS.has(value as OAuthProvider) || seen.has(value as OAuthProvider)) {
        return false;
      }

      seen.add(value as OAuthProvider);
      return true;
    });
}

/** Hide OAuth unless NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS lists providers (e.g. apple,google). */
export function resolveOAuthProviders(
  envValue?: string | null
): OAuthProvider[] {
  return parseOAuthProviders(envValue);
}

export function getOAuthSignInLabel(provider: OAuthProvider): string {
  if (provider === "apple") {
    return "Sign in with Apple";
  }

  return "Sign in with Google";
}
