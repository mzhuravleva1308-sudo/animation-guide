import { createClient } from "@/lib/supabase/client";

export type AuthenticatedProfileSummary = {
  profileId: string;
  profileSlug: string;
  profileName: string | null;
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
    .select("id, slug, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !profile?.id || !profile.slug) {
    return null;
  }

  return {
    profileId: profile.id,
    profileSlug: profile.slug,
    profileName: profile.name ?? null,
  };
}

export async function loadAuthenticatedProfileFilmState(
  profileId: string
): Promise<{
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number>;
}> {
  const supabase = createClient();

  const [ratingsResult, savedResult] = await Promise.all([
    supabase
      .from("film_ratings")
      .select("film_id, rating")
      .eq("profile_id", profileId),
    supabase
      .from("profile_film_lists")
      .select("film_id")
      .eq("profile_id", profileId)
      .eq("list_type", "to_watch"),
  ]);

  const filmRatings: Record<string, number> = {};
  for (const row of ratingsResult.data ?? []) {
    if (typeof row.rating === "number") {
      filmRatings[row.film_id] = row.rating;
    }
  }

  const savedFilmIds = new Set<string>(
    (savedResult.data ?? []).map((row) => row.film_id)
  );

  return { savedFilmIds, filmRatings };
}
