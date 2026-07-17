"use client";

import { useEffect, useRef, useState } from "react";
import { persistFilmRating } from "@/lib/film-profile-mutations";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";
import { useToast } from "@/components/ToastProvider";

type RatingChangeOptions = {
  skipOrderUpdate?: boolean;
};

type RatingButtonsProps = {
  filmId: string;
  profileId?: string;
  profileToken?: string;
  initialRating?: number | null;
  onRatingChange?: (
    filmId: string,
    rating: number | null,
    options?: RatingChangeOptions
  ) => void;
  onAuthRequired?: (action: PendingFilmActionInput) => void;
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
  profileToken,
  initialRating = null,
  onRatingChange,
  onAuthRequired,
}: RatingButtonsProps) {
  const normalizedInitialRating = normalizeRating(initialRating);
  const [rating, setRating] = useState<number | null>(normalizedInitialRating);
  const ratingRef = useRef<number | null>(normalizedInitialRating);
  const saveRequestIdRef = useRef(0);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const nextRating = normalizeRating(initialRating);
    setRating(nextRating);
    ratingRef.current = nextRating;
  }, [filmId, initialRating]);

  useEffect(() => {
    ratingRef.current = rating;
  }, [rating]);

  async function saveRating(value: number) {
    const previousRating = ratingRef.current;
    const nextRating = previousRating === value ? null : value;

    if (!profileId) {
      if (!onAuthRequired) {
        console.error("Rating save skipped: missing profileId");
        return;
      }

      setRating(nextRating);
      ratingRef.current = nextRating;
      onRatingChange?.(filmId, nextRating);
      onAuthRequired({
        type: "rating",
        filmId,
        rating: nextRating,
      });
      return;
    }

    const requestId = ++saveRequestIdRef.current;

    setIsSaving(true);
    setRating(nextRating);
    ratingRef.current = nextRating;
    onRatingChange?.(filmId, nextRating);

    if (nextRating === null) {
      showToast(
        "Rating removed",
        "and no longer affects your taste profile."
      );
    } else {
      showToast(
        "Saved to Watched",
        "and added to your taste profile."
      );
    }

    let error: { message: string } | null = null;

    try {
      ({ error } = await persistFilmRating({
        profileId,
        filmId,
        rating: nextRating,
        profileToken,
      }));
    } catch (cause) {
      error = {
        message: cause instanceof Error ? cause.message : "Network error",
      };
    }

    if (requestId !== saveRequestIdRef.current) {
      return;
    }

    if (error) {
      console.error("Rating save error", error);
      setRating(previousRating);
      ratingRef.current = previousRating;
      onRatingChange?.(filmId, previousRating, { skipOrderUpdate: true });
      setIsSaving(false);
      showToast(
        "Couldn’t save your changes.",
        "Please try again.",
        "error"
      );
      return;
    }

    setIsSaving(false);
  }

  return (
    <div
      className="relative z-10"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {rating != null && (
        <p className="mb-3 text-sm text-gray-500">My rating: {rating}/10</p>
      )}

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Rate ${value} out of 10`}
            aria-pressed={rating === value}
            disabled={isSaving}
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
