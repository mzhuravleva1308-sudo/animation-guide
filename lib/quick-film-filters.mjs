import {
  ANIMATION_TECHNIQUE_FILTERS,
  filmMatchesTechniqueFilter,
  isAnimationTechniqueFilter,
  isStopMotionTechnique as techniqueIsStopMotion,
} from "./animation-technique-filters.mjs";
import { MEDIA_TYPE } from "./media-type.mjs";

export const QUICK_FILTERS = Object.freeze([
  "recent",
  "award-winners",
  "stop-motion",
  "sci-fi",
  "sarcasm",
  "connection",
  "distance",
]);

/** Live-action catalog: Landscapes replaces Stop motion in the same slot. */
export const LIVE_ACTION_QUICK_FILTERS = Object.freeze([
  "recent",
  "award-winners",
  "landscapes",
  "sci-fi",
  "sarcasm",
  "connection",
  "distance",
]);

/**
 * @param {string} [mediaType]
 * @returns {readonly string[]}
 */
export function getQuickFiltersForMedia(mediaType = MEDIA_TYPE.animation) {
  return mediaType === MEDIA_TYPE.liveAction
    ? LIVE_ACTION_QUICK_FILTERS
    : QUICK_FILTERS;
}

const TECHNIQUE_DESCRIPTIONS = Object.fromEntries(
  ANIMATION_TECHNIQUE_FILTERS.map((row) => [row.id, row.description])
);

export const QUICK_FILTER_DESCRIPTIONS = {
  recent: "Films released in the last three years.",
  "award-winners": "Films that won top prizes at major festivals.",
  landscapes: "Films shaped by place, outdoors and the feel of landscape.",
  "sci-fi": "Stories shaped by technology, space and imagined futures.",
  sarcasm: "Darkly funny films with dry irony, cynicism and bite.",
  connection: "Films with more warmth, connection and emotional closeness.",
  distance: "Films with more distance, isolation and emotional darkness.",
  ...TECHNIQUE_DESCRIPTIONS,
};

export const isStopMotionTechnique = techniqueIsStopMotion;

export function isAllowedQuickFilter(filter, availableFilters) {
  if (!filter) {
    return true;
  }

  if (availableFilters.includes(filter)) {
    return true;
  }

  return (
    isAnimationTechniqueFilter(filter) &&
    availableFilters.includes("stop-motion")
  );
}

export function filterFilmsByQuickFilter(
  films,
  activeQuickFilter,
  awardWinningFilmIdSet
) {
  if (activeQuickFilter === "recent") {
    const currentYear = new Date().getFullYear();
    const recentYearFrom = currentYear - 2;

    return films.filter(
      (film) =>
        typeof film.year === "number" &&
        film.year >= recentYearFrom &&
        film.year <= currentYear
    );
  }

  if (activeQuickFilter === "award-winners") {
    return films.filter((film) => awardWinningFilmIdSet.has(film.id));
  }

  if (isAnimationTechniqueFilter(activeQuickFilter)) {
    return films.filter((film) =>
      filmMatchesTechniqueFilter(film, activeQuickFilter)
    );
  }

  if (activeQuickFilter === "landscapes") {
    // Tagging not applied yet — chip is live; matches arrive once films are marked.
    return films.filter((film) => film.quick_filters?.includes("landscapes"));
  }

  if (activeQuickFilter === "sci-fi") {
    return films.filter((film) => film.quick_filters?.includes("sci-fi"));
  }

  if (activeQuickFilter === "sarcasm") {
    return films.filter((film) => film.quick_filters?.includes("sarcasm"));
  }

  if (activeQuickFilter === "connection") {
    return films.filter((film) => film.quick_filters?.includes("connection"));
  }

  if (activeQuickFilter === "distance") {
    return films.filter((film) => film.quick_filters?.includes("distance"));
  }

  return films;
}
