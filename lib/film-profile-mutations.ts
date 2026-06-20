import { supabase } from "@/lib/supabase";
import { logProfileActivityClient } from "@/lib/log-profile-activity-client";

type MutationError = {
  message: string;
};

type MutationResult = {
  error: MutationError | null;
};

export async function persistFilmRating({
  profileId,
  filmId,
  rating,
}: {
  profileId: string;
  filmId: string;
  rating: number | null;
}): Promise<MutationResult> {
  if (rating === null) {
    const { error } = await supabase
      .from("film_ratings")
      .delete()
      .eq("film_id", filmId)
      .eq("profile_id", profileId);

    if (error) {
      return { error: { message: error.message } };
    }

    logProfileActivityClient({
      profileId,
      filmId,
      eventType: "rating_removed",
    });
    logProfileActivityClient({
      profileId,
      filmId,
      eventType: "film_unwatched",
    });

    return { error: null };
  }

  const { error } = await supabase.from("film_ratings").upsert(
    {
      film_id: filmId,
      profile_id: profileId,
      rating,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "film_id,profile_id",
    }
  );

  if (error) {
    return { error: { message: error.message } };
  }

  logProfileActivityClient({
    profileId,
    filmId,
    eventType: "rating_set",
    eventData: { rating },
  });
  logProfileActivityClient({
    profileId,
    filmId,
    eventType: "film_watched",
    eventData: { rating },
  });

  return { error: null };
}

export async function persistFilmSave({
  profileId,
  filmId,
  saved,
}: {
  profileId: string;
  filmId: string;
  saved: boolean;
}): Promise<MutationResult> {
  if (saved) {
    const { data: existingItem, error: existingError } = await supabase
      .from("profile_film_lists")
      .select("id")
      .eq("film_id", filmId)
      .eq("profile_id", profileId)
      .eq("list_type", "to_watch")
      .maybeSingle();

    if (existingError) {
      return { error: { message: existingError.message } };
    }

    if (existingItem) {
      return { error: null };
    }

    const { error } = await supabase.from("profile_film_lists").insert({
      film_id: filmId,
      profile_id: profileId,
      list_type: "to_watch",
    });

    if (error) {
      return { error: { message: error.message } };
    }

    logProfileActivityClient({
      profileId,
      filmId,
      eventType: "film_saved",
    });

    return { error: null };
  }

  const { error } = await supabase
    .from("profile_film_lists")
    .delete()
    .eq("film_id", filmId)
    .eq("profile_id", profileId)
    .eq("list_type", "to_watch");

  if (error) {
    return { error: { message: error.message } };
  }

  logProfileActivityClient({
    profileId,
    filmId,
    eventType: "film_unsaved",
  });

  return { error: null };
}
