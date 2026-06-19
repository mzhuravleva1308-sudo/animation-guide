export function getAuthCallbackUrl(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/auth/callback`;
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
