import { FESTIVALS_ANNECY_PATH } from "./public-festival-paths.mjs";

/** Annecy feature-award years with published Resonale pages (newest first). */
export const ANNECY_FEATURE_AWARD_YEARS = [2026, 2025, 2024];

/**
 * @param {number} activeYear
 */
export function annecyFeatureAwardYearOptions(activeYear) {
  return ANNECY_FEATURE_AWARD_YEARS.map((year) => ({
    year,
    href: FESTIVALS_ANNECY_PATH(year),
    active: year === activeYear,
  }));
}
