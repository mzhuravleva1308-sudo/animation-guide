"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logProfileActivityClient } from "@/lib/log-profile-activity-client";

type RatingChangeOptions = {
  skipOrderUpdate?: boolean;
};

type RatingButtonsProps = {
  filmId: string;
  profileId?: string;
  initialRating?: number | null;
  onRatingChange?: (
    filmId: string,
    rating: number | null,
    options?: RatingChangeOptions
  ) => void;
};

function normalizeRating(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

export default function RatingButtons({
  filmId,
  profileId,
  initialRating = null,
  onRatingChange,
}: RatingButtonsProps) {
  const normalizedInitialRating = normalizeRating(initialRating);
  const [rating, setRating] = useState<number | null>(normalizedInitialRating);
  const ratingRef = useRef<number | null>(normalizedInitialRating);
  const saveRequestIdRef = useRef(0);

  useEffect(() => {
    const nextRating = normalizeRating(initialRating);
    setRating(nextRating);
    ratingRef.current = nextRating;
  }, [filmId, initialRating]);

  useEffect(() => {
    ratingRef.current = rating;
  }, [rating]);

  async function saveRating(value: number) {
    if (!profileId) {
      console.error("Rating save skipped: missing profileId");
      return;
    }

    const previousRating = ratingRef.current;
    const nextRating = previousRating === value ? null : value;
    const requestId = ++saveRequestIdRef.current;

    setRating(nextRating);
    ratingRef.current = nextRating;
    onRatingChange?.(filmId, nextRating);

    let error: { message?: string } | null = null;

    if (nextRating === null) {
      ({ error } = await supabase
        .from("film_ratings")
        .delete()
        .eq("film_id", filmId)
        .eq("profile_id", profileId));
    } else {
      ({ error } = await supabase.from("film_ratings").upsert(
        {
          film_id: filmId,
          profile_id: profileId,
          rating: nextRating,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "film_id,profile_id",
        }
      ));
    }

    if (requestId !== saveRequestIdRef.current) {
      return;
    }

    if (error) {
      console.error("Rating save error", error);
      setRating(previousRating);
      ratingRef.current = previousRating;
      onRatingChange?.(filmId, previousRating, { skipOrderUpdate: true });
      return;
    }

    if (nextRating === null) {
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
      return;
    }

    logProfileActivityClient({
      profileId,
      filmId,
      eventType: "rating_set",
      eventData: { rating: nextRating },
    });
    logProfileActivityClient({
      profileId,
      filmId,
      eventType: "film_watched",
      eventData: { rating: nextRating },
    });
  }

  return (
    <div
      className="relative z-10"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="mb-3 text-sm text-gray-500">
        My rating: {rating ? `${rating}/10` : "not rated yet"}
      </p>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Rate ${value} out of 10`}
            aria-pressed={rating === value}
            onClick={() => saveRating(value)}
            className={`inline-flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full border p-0 text-sm leading-none touch-manipulation ${
              rating === value
                ? "border-black bg-black text-white"
                : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}