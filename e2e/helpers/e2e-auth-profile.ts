import { createClient } from "@supabase/supabase-js";
import { requireProfileTestCredentials } from "./profile-credentials";
import { resetE2eProfile } from "./reset-e2e-profile";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} for E2E auth profile helpers.`);
  }

  return value;
}

function createServiceRoleClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function deleteAuthUserByEmail(email: string) {
  const supabase = createServiceRoleClient();
  const user = await findAuthUserByEmail(email);

  if (!user) {
    return;
  }

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error(`Failed to delete auth user for ${email}: ${error.message}`);
  }
}

async function findAuthUserByEmail(email: string) {
  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    );
    if (match) {
      return match;
    }

    if (data.users.length < 200) {
      break;
    }
  }

  return null;
}

export async function unlinkE2eProfileUser(): Promise<void> {
  const credentials = requireProfileTestCredentials();
  const supabase = createServiceRoleClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", credentials.slug)
    .eq("share_token", credentials.token)
    .single();

  if (error || !profile) {
    throw new Error(
      `Failed to load E2E profile for unlink: ${error?.message ?? "not found"}`
    );
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ user_id: null })
    .eq("id", profile.id);

  if (updateError) {
    throw new Error(`Failed to unlink E2E profile user: ${updateError.message}`);
  }
}

export async function linkAuthUserEmailToE2eProfile(
  email: string
): Promise<{ profileId: string; userId: string }> {
  const credentials = requireProfileTestCredentials();
  const supabase = createServiceRoleClient();

  let user = await findAuthUserByEmail(email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(
        `Failed to create auth user for ${email}: ${error?.message ?? "unknown error"}`
      );
    }

    user = data.user;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", credentials.slug)
    .eq("share_token", credentials.token)
    .single();

  if (profileError || !profile) {
    throw new Error(
      `Failed to load E2E profile for link: ${profileError?.message ?? "not found"}`
    );
  }

  const { error: clearError } = await supabase
    .from("profiles")
    .update({ user_id: null })
    .eq("user_id", user.id);

  if (clearError) {
    throw new Error(`Failed to clear previous profile links: ${clearError.message}`);
  }

  const { error: linkError } = await supabase
    .from("profiles")
    .update({ user_id: user.id })
    .eq("id", profile.id);

  if (linkError) {
    throw new Error(`Failed to link auth user to E2E profile: ${linkError.message}`);
  }

  return { profileId: profile.id, userId: user.id };
}

export async function prepareE2eFilmsAuthProfile(email: string): Promise<string> {
  const credentials = requireProfileTestCredentials();
  await deleteAuthUserByEmail(email);
  await resetE2eProfile(credentials);
  await unlinkE2eProfileUser();

  const supabase = createServiceRoleClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", credentials.slug)
    .eq("share_token", credentials.token)
    .single();

  if (error || !profile) {
    throw new Error(
      `Failed to load E2E profile for pending-action setup: ${error?.message ?? "not found"}`
    );
  }

  return profile.id;
}

export async function assertFilmSavedInProfile(
  profileId: string,
  filmId: string,
  saved: boolean
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("profile_film_lists")
    .select("id")
    .eq("profile_id", profileId)
    .eq("film_id", filmId)
    .eq("list_type", "to_watch")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read saved list row: ${error.message}`);
  }

  if (saved && !data) {
    throw new Error(`Expected film ${filmId} to be saved for profile ${profileId}.`);
  }

  if (!saved && data) {
    throw new Error(`Expected film ${filmId} to be unsaved for profile ${profileId}.`);
  }
}

export async function assertFilmRatingInProfile(
  profileId: string,
  filmId: string,
  rating: number | null
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("film_ratings")
    .select("rating")
    .eq("profile_id", profileId)
    .eq("film_id", filmId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read film rating row: ${error.message}`);
  }

  if (rating === null) {
    if (data) {
      throw new Error(`Expected no rating for film ${filmId}, found ${data.rating}.`);
    }
    return;
  }

  if (!data || data.rating !== rating) {
    throw new Error(
      `Expected rating ${rating} for film ${filmId}, found ${data?.rating ?? "none"}.`
    );
  }
}

export async function countSavedListRowsForFilm(
  profileId: string,
  filmId: string
): Promise<number> {
  const supabase = createServiceRoleClient();

  const { count, error } = await supabase
    .from("profile_film_lists")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("film_id", filmId)
    .eq("list_type", "to_watch");

  if (error) {
    throw new Error(`Failed to count saved list rows: ${error.message}`);
  }

  return count ?? 0;
}

export async function countRatingRowsForFilm(
  profileId: string,
  filmId: string
): Promise<number> {
  const supabase = createServiceRoleClient();

  const { count, error } = await supabase
    .from("film_ratings")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("film_id", filmId);

  if (error) {
    throw new Error(`Failed to count rating rows: ${error.message}`);
  }

  return count ?? 0;
}
