import { createClient } from "@/lib/supabase/client";
import { logProfileActivityClient } from "@/lib/log-profile-activity-client";
import type { FilmRatingDetail } from "@/lib/rating-detail";

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

export async function persistFilmRatingDetail({
  filmId,
  detail,
}: {
  filmId: string;
  detail: FilmRatingDetail;
}): Promise<MutationResult> {
  const response = await fetch("/api/profile-rating-detail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filmId,
      visual: detail.visual,
      mood: detail.mood,
      plot: detail.plot,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return {
      error: {
        message: body?.error ?? "Could not save rating detail",
      },
    };
  }

  return { error: null };
}

export async function loadFilmRatingDetails(): Promise<{
  details: Record<string, FilmRatingDetail>;
  error: MutationError | null;
}> {
  const response = await fetch("/api/profile-rating-detail", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return {
      details: {},
      error: {
        message: body?.error ?? "Could not load rating details",
      },
    };
  }

  const body = (await response.json().catch(() => null)) as {
    details?: Record<string, FilmRatingDetail>;
  } | null;

  return {
    details: body?.details ?? {},
    error: null,
  };
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
