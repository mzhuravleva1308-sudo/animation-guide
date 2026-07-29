import { createClient } from "@/lib/supabase/client";
import { logProfileActivityClient } from "@/lib/log-profile-activity-client";

type MutationError = {
  message: string;
};

type MutationResult = {
  error: MutationError | null;
};

// All mutations go through the authenticated session.
// The server resolves the profile from session; the client only sends
// the action data (filmId + rating/saved).

export async function persistFilmRating({
  filmId,
  rating,
}: {
  filmId: string;
  rating: number | null;
}): Promise<MutationResult> {
  const response = await fetch("/api/profile-rating", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filmId, rating }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return {
      error: {
        message: body?.error ?? "Could not save film rating",
      },
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (rating === null) {
      logProfileActivityClient({ filmId, eventType: "rating_removed" });
      logProfileActivityClient({ filmId, eventType: "film_unwatched" });
    } else {
      logProfileActivityClient({ filmId, eventType: "rating_set", eventData: { rating } });
      logProfileActivityClient({ filmId, eventType: "film_watched", eventData: { rating } });
    }
  }

  return { error: null };
}

export async function persistFilmSave({
  filmId,
  saved,
}: {
  filmId: string;
  saved: boolean;
}): Promise<MutationResult> {
  const response = await fetch("/api/profile-save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filmId, saved }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return {
      error: {
        message: body?.error ?? "Could not save film",
      },
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    logProfileActivityClient({
      filmId,
      eventType: saved ? "film_saved" : "film_unsaved",
    });
  }

  return { error: null };
}
