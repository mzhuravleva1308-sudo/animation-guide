"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRatingOnboardingHint,
  hasLikedHighFilmRating,
  readRatingOnboardingHintsDismissed,
  writeRatingOnboardingHintsDismissed,
  type RatingOnboardingHint,
} from "@/lib/rating-onboarding";
import { MEDIA_TYPE, type MediaType } from "@/lib/media-type";

export function useRatingOnboarding(
  filmRatings: Record<string, number | null> | undefined,
  options?: {
    enabled?: boolean;
    ratingsReady?: boolean;
    /** Catalog media this hint series belongs to (independent per type). */
    mediaType?: MediaType;
    /**
     * Film IDs in this media catalog. Required for correct media scoping when
     * `filmRatings` also contains the other media type.
     */
    scopeFilmIds?: Iterable<string>;
  }
) {
  const enabled = options?.enabled ?? true;
  const ratingsReady = options?.ratingsReady ?? true;
  const mediaType = options?.mediaType ?? MEDIA_TYPE.animation;
  const scopeFilmIds = options?.scopeFilmIds;
  const [ratingHintsDismissed, setRatingHintsDismissed] = useState(false);
  const [ratingHintsStorageReady, setRatingHintsStorageReady] = useState(false);

  useEffect(() => {
    setRatingHintsDismissed(readRatingOnboardingHintsDismissed(mediaType));
    setRatingHintsStorageReady(true);
  }, [mediaType]);

  const hasLikedHighRating = useMemo(
    () =>
      hasLikedHighFilmRating(filmRatings, {
        filmIds: scopeFilmIds,
      }),
    [filmRatings, scopeFilmIds]
  );

  const canShowRatingOnboarding =
    enabled &&
    ratingsReady &&
    ratingHintsStorageReady &&
    !hasLikedHighRating &&
    !ratingHintsDismissed;

  const onDismissRatingOnboarding = useCallback(() => {
    writeRatingOnboardingHintsDismissed(mediaType);
    setRatingHintsDismissed(true);
  }, [mediaType]);

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
