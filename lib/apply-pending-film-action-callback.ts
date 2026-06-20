import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingFilmAction } from "@/lib/pending-film-action";

export async function applyPendingFilmActionWithClient(
  supabase: SupabaseClient,
  profileId: string,
  action: PendingFilmAction
): Promise<{ error: string | null }> {
  if (action.type === "save") {
    if (action.saved) {
      const { data: existingItem, error: existingError } = await supabase
        .from("profile_film_lists")
        .select("id")
        .eq("film_id", action.filmId)
        .eq("profile_id", profileId)
        .eq("list_type", "to_watch")
        .maybeSingle();

      if (existingError) {
        return { error: existingError.message };
      }

      if (existingItem) {
        return { error: null };
      }

      const { error } = await supabase.from("profile_film_lists").insert({
        film_id: action.filmId,
        profile_id: profileId,
        list_type: "to_watch",
      });

      return { error: error?.message ?? null };
    }

    const { error } = await supabase
      .from("profile_film_lists")
      .delete()
      .eq("film_id", action.filmId)
      .eq("profile_id", profileId)
      .eq("list_type", "to_watch");

    return { error: error?.message ?? null };
  }

  if (action.rating === null) {
    const { error } = await supabase
      .from("film_ratings")
      .delete()
      .eq("film_id", action.filmId)
      .eq("profile_id", profileId);

    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("film_ratings").upsert(
    {
      film_id: action.filmId,
      profile_id: profileId,
      rating: action.rating,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "film_id,profile_id",
    }
  );

  return { error: error?.message ?? null };
}
