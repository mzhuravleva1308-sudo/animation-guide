import { LIKED_HIGH_RATING_THRESHOLD } from "./profile-film-scoring.mjs";
import { MEDIA_TYPE, normalizeMediaType } from "./media-type.mjs";

/** @deprecated Prefer media-scoped keys via ratingOnboardingHintsDismissedStorageKey. */
export const RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY =
  "animationpre:rating-onboarding-hints-dismissed";

export const RATING_ONBOARDING_HINT_COPY = {
  extended: "Seen it? Rate it to start shaping your taste profile.",
  short: "Seen it? Rate it.",
};

/**
 * @param {string | null | undefined} mediaType
 */
export function ratingOnboardingHintsDismissedStorageKey(mediaType) {
  const normalized = normalizeMediaType(mediaType, MEDIA_TYPE.animation);
  return `${RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY}:${normalized}`;
}

/**
 * @param {Record<string, number | null> | null | undefined} filmRatings
 * @deprecated Use hasLikedHighFilmRating with media-scoped film IDs.
 */
export function hasAnyFilmRating(filmRatings) {
  if (!filmRatings) {
    return false;
  }

  return Object.values(filmRatings).some(
    (rating) => rating != null && Number.isFinite(rating)
  );
}

/**
 * True when the user has at least one rating at/above the taste-unlock
 * threshold among the given media-scoped film IDs.
 *
 * @param {Record<string, number | null> | null | undefined} filmRatings
 * @param {{
 *   filmIds?: Iterable<string> | null,
 *   threshold?: number,
 * }} [options]
 */
export function hasLikedHighFilmRating(filmRatings, options = {}) {
  if (!filmRatings) {
    return false;
  }

  const threshold = options.threshold ?? LIKED_HIGH_RATING_THRESHOLD;
  const filmIdSet =
    options.filmIds == null ? null : new Set(options.filmIds);

  return Object.entries(filmRatings).some(([filmId, rating]) => {
    if (filmIdSet && !filmIdSet.has(filmId)) {
      return false;
    }

    return (
      rating != null &&
      Number.isFinite(rating) &&
      Number(rating) >= threshold
    );
  });
}

/**
 * @param {{
 *   index: number;
 *   hasAnyRating: boolean;
 *   ratingHintsDismissed: boolean;
 * }} options
 * @returns {"extended" | "short" | null}
 */
export function getRatingOnboardingHint(options) {
  const { index, hasAnyRating, ratingHintsDismissed } = options;

  if (hasAnyRating || ratingHintsDismissed) {
    return null;
  }

  if (index < 3) {
    return "extended";
  }

  if (index < 5) {
    return "short";
  }

  return null;
}

/**
 * @param {string | null | undefined} mediaType
 */
export function readRatingOnboardingHintsDismissed(mediaType) {
  if (typeof window === "undefined") {
    return false;
  }

  const normalized = normalizeMediaType(mediaType, MEDIA_TYPE.animation);

  try {
    if (
      window.localStorage.getItem(
        ratingOnboardingHintsDismissedStorageKey(normalized)
      ) === "1"
    ) {
      return true;
    }

    // Legacy shared key only applies to animation so Films stays independent.
    if (
      normalized === MEDIA_TYPE.animation &&
      window.localStorage.getItem(
        RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY
      ) === "1"
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * @param {string | null | undefined} mediaType
 */
export function writeRatingOnboardingHintsDismissed(mediaType) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeMediaType(mediaType, MEDIA_TYPE.animation);

  try {
    window.localStorage.setItem(
      ratingOnboardingHintsDismissedStorageKey(normalized),
      "1"
    );
  } catch {
    // Ignore quota / private-mode failures; in-memory dismiss still applies.
  }
}
