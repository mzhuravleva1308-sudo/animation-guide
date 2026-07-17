import { createClient } from "@supabase/supabase-js";
import { isAllowedE2eProfileSlug } from "./project-profile-credentials";
import type { ProfileTestCredentials } from "./profile-credentials";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} for E2E profile reset.`);
  }

  return value;
}

async function loadE2eProfile(credentials: ProfileTestCredentials) {
  if (!isAllowedE2eProfileSlug(credentials.slug)) {
    throw new Error(
      `Refusing to reset profile: slug "${credentials.slug}" is not an allowed E2E profile.`
    );
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, slug, name")
    .eq("slug", credentials.slug)
    .eq("share_token", credentials.token)
    .single();

  if (profileError || !profile) {
    throw new Error(
      `E2E profile not found for slug/token pair: ${profileError?.message ?? "unknown error"}`
    );
  }

  return { supabase, profile };
}

/**
 * Resets mutable state on the dedicated E2E test profile only.
 *
 * See TESTING.md for the full project testing convention (profile mutation,
 * cleanup hooks, and SUPABASE_SERVICE_ROLE_KEY rules).
 *
 * Safety: refuses to run unless credentials match a known E2E profile slug/token
 * pair in the database.
 */
export async function resetE2eProfile(
  credentials: ProfileTestCredentials
): Promise<string> {
  const { supabase, profile } = await loadE2eProfile(credentials);

  const { error: ratingsError } = await supabase
    .from("film_ratings")
    .delete()
    .eq("profile_id", profile.id);

  if (ratingsError) {
    throw new Error(`Failed to clear E2E ratings: ${ratingsError.message}`);
  }

  const { error: watchlistError } = await supabase
    .from("profile_film_lists")
    .delete()
    .eq("profile_id", profile.id)
    .eq("list_type", "to_watch");

  if (watchlistError) {
    throw new Error(
      `Failed to clear E2E watchlist: ${watchlistError.message}`
    );
  }

  return profile.id;
}

export async function resetE2eProfileFilmRating(
  credentials: ProfileTestCredentials,
  filmId: string
): Promise<void> {
  const { supabase, profile } = await loadE2eProfile(credentials);

  const { error } = await supabase
    .from("film_ratings")
    .delete()
    .eq("profile_id", profile.id)
    .eq("film_id", filmId);

  if (error) {
    throw new Error(
      `Failed to clear E2E rating for film ${filmId}: ${error.message}`
    );
  }
}
