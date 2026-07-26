export const RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY =
  "animationpre:rating-onboarding-hints-dismissed";

export const RATING_ONBOARDING_HINT_COPY = {
  extended: "Seen it? Rate it to start shaping your taste profile.",
  short: "Seen it? Rate it.",
};

/**
 * @param {Record<string, number | null> | null | undefined} filmRatings
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

export function readRatingOnboardingHintsDismissed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.localStorage.getItem(
        RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY
      ) === "1"
    );
  } catch {
    return false;
  }
}

export function writeRatingOnboardingHintsDismissed() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY,
      "1"
    );
  } catch {
    // Ignore quota / private-mode failures; in-memory dismiss still applies.
  }
}
