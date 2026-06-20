/**
 * @param {string} slug
 * @param {string} shareToken
 * @returns {string}
 */
export function buildProfileGuidePath(slug, shareToken) {
  const normalizedSlug = slug.trim();
  const normalizedToken = shareToken.trim();

  if (!normalizedSlug || !normalizedToken) {
    throw new Error("Profile slug and share token are required to build a guide URL.");
  }

  return `/p/${normalizedSlug}?token=${encodeURIComponent(normalizedToken)}`;
}

/**
 * @param {{ slug: string; share_token: string }} profile
 * @returns {string}
 */
export function buildProfileGuidePathFromProfile(profile) {
  return buildProfileGuidePath(profile.slug, profile.share_token);
}
