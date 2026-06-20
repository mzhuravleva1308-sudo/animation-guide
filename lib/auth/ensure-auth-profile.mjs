import {
  buildProfileSlugCandidate,
  deriveProfileNameFromEmail,
  deriveProfileSlugBase,
  isLinkedGuideProfile,
} from "./profile-provision.mjs";

const PROFILE_SELECT =
  "id, slug, name, share_token, user_id";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 */
async function loadProfileByUserId(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile for auth user: ${error.message}`);
  }

  return data;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; slug?: string | null; share_token?: string | null; name?: string | null }} profile
 * @param {{ id: string; email?: string | null }} user
 */
async function repairProfileForUser(supabase, profile, user) {
  const updates = {};

  if (!profile.slug) {
    updates.slug = deriveProfileSlugBase(user.email, user.id);
  }

  if (!profile.share_token) {
    updates.share_token = crypto.randomUUID();
  }

  if (!profile.name?.trim()) {
    updates.name = deriveProfileNameFromEmail(user.email);
  }

  if (Object.keys(updates).length === 0) {
    return profile;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", profile.id)
    .eq("user_id", user.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    throw new Error(`Failed to repair auth profile: ${error.message}`);
  }

  return data;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; email?: string | null }} user
 */
async function insertProfileForUser(supabase, user) {
  const slugBase = deriveProfileSlugBase(user.email, user.id);
  const name = deriveProfileNameFromEmail(user.email);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = buildProfileSlugCandidate(slugBase, attempt);
    const shareToken = crypto.randomUUID();

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        slug,
        share_token: shareToken,
        name,
      })
      .select(PROFILE_SELECT)
      .single();

    if (!error && data) {
      return data;
    }

    if (error?.code === "23505") {
      const existing = await loadProfileByUserId(supabase, user.id);
      if (existing && isLinkedGuideProfile(existing, user.id)) {
        return existing;
      }

      continue;
    }

    throw new Error(`Failed to create auth profile: ${error?.message ?? "unknown error"}`);
  }

  const existing = await loadProfileByUserId(supabase, user.id);
  if (existing && isLinkedGuideProfile(existing, user.id)) {
    return existing;
  }

  throw new Error("Failed to create auth profile after slug retries.");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; email?: string | null }} user
 */
/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; email?: string | null }} user
 * @returns {Promise<{ profile: Awaited<ReturnType<typeof loadProfileByUserId>>; created: boolean }>}
 */
export async function ensureAuthProfileForUser(supabase, user) {
  const existing = await loadProfileByUserId(supabase, user.id);

  if (existing && isLinkedGuideProfile(existing, user.id)) {
    return { profile: existing, created: false };
  }

  if (existing?.id) {
    const repaired = await repairProfileForUser(supabase, existing, user);
    if (isLinkedGuideProfile(repaired, user.id)) {
      return { profile: repaired, created: false };
    }
  }

  const profile = await insertProfileForUser(supabase, user);
  return { profile, created: true };
}
