import {
  buildProfileSlugCandidate,
  deriveProfileSlugBase,
  isLinkedGuideProfile,
} from "./profile-provision.mjs";

// share_token is still selected so legacy rows that already have it are
// returned intact. Runtime code no longer uses it for authorization.
// Column will be dropped in Phase B after all legacy users are migrated.
const PROFILE_SELECT =
  "id, slug, name, share_token, user_id";

function createProfileProvisionError(message, code) {
  const error = new Error(message);

  if (code) {
    error.code = code;
  }

  return error;
}

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
    throw createProfileProvisionError(
      `Failed to load profile for auth user: ${error.message}`,
      error.code
    );
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

  // Phase A: share_token is no longer generated or checked at runtime.
  // Existing values are left as-is; new profiles do not receive one.

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
    throw createProfileProvisionError(
      `Failed to repair auth profile: ${error.message}`,
      error.code
    );
  }

  return data;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; email?: string | null }} user
 */
async function insertProfileForUser(supabase, user) {
  const slugBase = deriveProfileSlugBase(user.email, user.id);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = buildProfileSlugCandidate(slugBase, attempt);

    // share_token is omitted intentionally — Phase A: runtime no longer
    // assigns it to new profiles. Column default (gen_random_uuid()) will
    // fill it at the DB level if the column still has NOT NULL + DEFAULT.
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        slug,
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

    throw createProfileProvisionError(
      `Failed to create auth profile: ${error?.message ?? "unknown error"}`,
      error?.code
    );
  }

  const existing = await loadProfileByUserId(supabase, user.id);
  if (existing && isLinkedGuideProfile(existing, user.id)) {
    return existing;
  }

  throw createProfileProvisionError(
    "Failed to create auth profile after slug retries.",
    "profile_slug_retry_exhausted"
  );
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
