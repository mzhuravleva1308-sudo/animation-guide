import { createClient } from "@/lib/supabase/client";

export type AuthenticatedProfileSummary = {
  profileId: string;
  profileSlug: string;
  profileName: string | null;
  tasteProfile: string | null;
  tasteProfileUpdatedAt: string | null;
};

export async function resolveAuthenticatedProfile(): Promise<AuthenticatedProfileSummary | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, slug, name, taste_profile, taste_profile_updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !profile?.id || !profile.slug) {
    return null;
  }

  return {
    profileId: profile.id,
    profileSlug: profile.slug,
    profileName: profile.name ?? null,
    tasteProfile: profile.taste_profile ?? null,
    tasteProfileUpdatedAt: profile.taste_profile_updated_at ?? null,
  };
}

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export async function loadAuthenticatedProfileFilmState(
  profileId: string
): Promise<{
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number>;
  /** film_ratings.updated_at as epoch ms — newest Watched first */
  ratingUpdatedAtMs: Record<string, number>;
  /** profile_film_lists.created_at as epoch ms — newest Saved first */
  savedAtMs: Record<string, number>;
}> {
  const supabase = createClient();

  const [ratingsResult, savedResult] = await Promise.all([
    supabase
      .from("film_ratings")
      .select("film_id, rating, updated_at")
      .eq("profile_id", profileId),
    supabase
      .from("profile_film_lists")
      .select("film_id, created_at")
      .eq("profile_id", profileId)
      .eq("list_type", "to_watch"),
  ]);

  const filmRatings: Record<string, number> = {};
  const ratingUpdatedAtMs: Record<string, number> = {};
  for (const row of ratingsResult.data ?? []) {
    if (typeof row.rating === "number") {
      filmRatings[row.film_id] = row.rating;
      const ms = toEpochMs(row.updated_at);
      if (ms != null) {
        ratingUpdatedAtMs[row.film_id] = ms;
      }
    }
  }

  const savedFilmIds = new Set<string>();
  const savedAtMs: Record<string, number> = {};
  for (const row of savedResult.data ?? []) {
    savedFilmIds.add(row.film_id);
    const ms = toEpochMs(row.created_at);
    if (ms != null) {
      savedAtMs[row.film_id] = ms;
    }
  }

  return { savedFilmIds, filmRatings, ratingUpdatedAtMs, savedAtMs };
}
