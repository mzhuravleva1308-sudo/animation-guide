"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRatingOnboardingHint,
  hasAnyFilmRating,
  readRatingOnboardingHintsDismissed,
  writeRatingOnboardingHintsDismissed,
  type RatingOnboardingHint,
} from "@/lib/rating-onboarding";

export function useRatingOnboarding(
  filmRatings: Record<string, number | null> | undefined,
  options?: {
    enabled?: boolean;
    ratingsReady?: boolean;
  }
) {
  const enabled = options?.enabled ?? true;
  const ratingsReady = options?.ratingsReady ?? true;
  const [ratingHintsDismissed, setRatingHintsDismissed] = useState(false);
  const [ratingHintsStorageReady, setRatingHintsStorageReady] = useState(false);

  useEffect(() => {
    setRatingHintsDismissed(readRatingOnboardingHintsDismissed());
    setRatingHintsStorageReady(true);
  }, []);

  const hasAnyRating = useMemo(
    () => hasAnyFilmRating(filmRatings),
    [filmRatings]
  );

  const canShowRatingOnboarding =
    enabled &&
    ratingsReady &&
    ratingHintsStorageReady &&
    !hasAnyRating &&
    !ratingHintsDismissed;

  const onDismissRatingOnboarding = useCallback(() => {
    writeRatingOnboardingHintsDismissed();
    setRatingHintsDismissed(true);
  }, []);

  const getHintForIndex = useCallback(
    (index: number): RatingOnboardingHint => {
      if (!canShowRatingOnboarding) {
        return null;
      }

      return getRatingOnboardingHint({
        index,
        hasAnyRating: false,
        ratingHintsDismissed: false,
      });
    },
    [canShowRatingOnboarding]
  );

  return {
    canShowRatingOnboarding,
    getHintForIndex,
    onDismissRatingOnboarding: canShowRatingOnboarding
      ? onDismissRatingOnboarding
      : undefined,
  };
}
