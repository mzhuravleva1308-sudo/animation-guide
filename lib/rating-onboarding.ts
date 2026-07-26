export type RatingOnboardingHint = "extended" | "short" | null;

export {
  RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY,
  RATING_ONBOARDING_HINT_COPY,
  getRatingOnboardingHint,
  hasAnyFilmRating,
  readRatingOnboardingHintsDismissed,
  writeRatingOnboardingHintsDismissed,
} from "./rating-onboarding.mjs";
