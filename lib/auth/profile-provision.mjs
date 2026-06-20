/**
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function deriveProfileNameFromEmail(email) {
  const normalized = email?.trim().toLowerCase() ?? "";
  const localPart = normalized.split("@")[0] ?? "guide";
  const cleaned = localPart.replace(/[._+-]+/g, " ").trim();

  if (!cleaned) {
    return "My guide";
  }

  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * @param {string | null | undefined} email
 * @param {string} userId
 * @returns {string}
 */
export function deriveProfileSlugBase(email, userId) {
  const normalized = email?.trim().toLowerCase() ?? "";
  const localPart = normalized.split("@")[0] ?? "guide";
  const slugBase = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const suffix = userId.replace(/-/g, "").slice(0, 8);

  return slugBase ? `${slugBase}-${suffix}` : `guide-${suffix}`;
}

/**
 * @param {string} slugBase
 * @param {number} attempt
 * @returns {string}
 */
export function buildProfileSlugCandidate(slugBase, attempt) {
  if (attempt <= 0) {
    return slugBase;
  }

  return `${slugBase}-${attempt + 1}`;
}

/**
 * @param {{ id?: string | null; slug?: string | null; share_token?: string | null; user_id?: string | null }} profile
 * @param {string} userId
 * @returns {boolean}
 */
export function isLinkedGuideProfile(profile, userId) {
  return Boolean(
    profile?.id &&
      profile.slug &&
      profile.share_token &&
      profile.user_id === userId
  );
}
