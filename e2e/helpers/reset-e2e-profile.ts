import { createClient } from "@supabase/supabase-js";
import type { ProfileTestCredentials } from "./profile-credentials";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} for E2E profile reset.`);
  }

  return value;
}

/**
 * Resets mutable state on the dedicated E2E test profile only.
 *
 * SECURITY / CONVENTION (see TESTING.md):
 * - Uses SUPABASE_SERVICE_ROLE_KEY from process.env — Playwright Node process only.
 * - Never import this module from app/, components/, or other client code.
 * - Never prefix the service role key with NEXT_PUBLIC_.
 * - Never commit the real key (.env.local only).
 * - Refuses to run unless credentials match both E2E_PROFILE_SLUG and
 *   E2E_PROFILE_TOKEN, and the DB row matches that slug/token pair.
 */
export async function resetE2eProfile(
  credentials: ProfileTestCredentials
): Promise<string> {
  const expectedSlug = requireEnv("E2E_PROFILE_SLUG");
  const expectedToken = requireEnv("E2E_PROFILE_TOKEN");

  if (
    credentials.slug !== expectedSlug ||
    credentials.token !== expectedToken
  ) {
    throw new Error(
      "Refusing to reset profile: credentials do not match E2E env vars."
    );
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, slug, name")
    .eq("slug", expectedSlug)
    .eq("share_token", expectedToken)
    .single();

  if (profileError || !profile) {
    throw new Error(
      `E2E profile not found for slug/token pair: ${profileError?.message ?? "unknown error"}`
    );
  }

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
