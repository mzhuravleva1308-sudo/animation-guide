"use client";

import { useEffect, useRef, useState } from "react";
import { persistFilmRating } from "@/lib/film-profile-mutations";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";
import {
  RATING_ONBOARDING_HINT_COPY,
  type RatingOnboardingHint,
} from "@/lib/rating-onboarding";
import { useToast } from "@/components/ToastProvider";
import { catalogCircleControlClass } from "@/lib/catalog-control-size";

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
  ratingOnboardingHint?: RatingOnboardingHint;
  onDismissRatingOnboarding?: () => void;
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
  ratingOnboardingHint = null,
  onDismissRatingOnboarding,
}: RatingButtonsProps) {
  const normalizedInitialRating = normalizeRating(initialRating);
  const [rating, setRating] = useState<number | null>(normalizedInitialRating);
  const ratingRef = useRef<number | null>(normalizedInitialRating);
  const saveRequestIdRef = useRef(0);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  const showOnboardingHint =
    ratingOnboardingHint === "extended" || ratingOnboardingHint === "short";

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
      {showOnboardingHint ? (
        <div
          data-testid="rating-onboarding-hint"
          data-hint-variant={ratingOnboardingHint}
          className={
            ratingOnboardingHint === "extended"
              ? "mb-2 inline-flex w-fit max-w-full items-center gap-1 rounded-[10px] border border-soft-panel-border bg-soft-panel py-1 pl-2.5 pr-0.5"
              : "mb-2 inline-flex w-fit max-w-full items-center gap-0.5 rounded-[9px] border border-soft-panel-border-subtle bg-soft-panel-subtle py-0.5 pl-2 pr-0.5"
          }
        >
          <p
            className={
              ratingOnboardingHint === "extended"
                ? "min-w-0 whitespace-nowrap text-[11px] leading-none tracking-tight text-soft-panel-fg"
                : "whitespace-nowrap text-[11px] leading-none tracking-tight text-soft-panel-fg"
            }
          >
            {RATING_ONBOARDING_HINT_COPY[ratingOnboardingHint]}
          </p>
          <button
            type="button"
            aria-label="Dismiss rating tip"
            data-testid="rating-onboarding-hint-dismiss"
            onClick={onDismissRatingOnboarding}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] leading-none text-soft-panel-fg-muted transition hover:bg-soft-panel-hover/50 hover:text-soft-panel-fg"
          >
            ×
          </button>
        </div>
      ) : null}

      {rating != null && (
        <p className="mb-3 text-sm text-gray-500">My rating: {rating}/10</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Rate ${value} out of 10`}
            aria-pressed={rating === value}
            disabled={isSaving}
            onClick={() => saveRating(value)}
            className={`inline-flex ${catalogCircleControlClass} shrink-0 items-center justify-center rounded-full border p-0 text-sm leading-none touch-manipulation ${
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
