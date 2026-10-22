import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { VIBE_HIDDEN_LIST_TYPE } from "@/lib/vibe-hidden.mjs";

/**
 * Film IDs the signed-in viewer has archived from their catalog.
 * Empty set for guests.
 */
export async function loadArchivedFilmIdsForViewer() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Set();

    const admin = getAdminSupabase();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError || !profile?.id) return new Set();

    const { data, error } = await admin
      .from("profile_film_lists")
      .select("film_id")
      .eq("profile_id", profile.id)
      .eq("list_type", VIBE_HIDDEN_LIST_TYPE);

    if (error) return new Set();

    return new Set(
      (data ?? []).map((row) => row.film_id).filter(Boolean)
    );
  } catch {
    return new Set();
  }
}
