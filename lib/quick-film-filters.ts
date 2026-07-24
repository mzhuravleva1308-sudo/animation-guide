import { Film } from "@/types/film";
import type { QuickFilter, QuickFilterOption } from "@/components/QuickFilters";

export const QUICK_FILTERS: QuickFilterOption[] = [
  "recent",
  "award-winners",
  "stop-motion",
  "sci-fi",
  "connection",
  "distance",
];

function isStopMotionTechnique(technique: string | null | undefined) {
  const value = (technique ?? "").toLowerCase();

  return [
    "stop motion",
    "stop-motion",
    "stopmotion",
    "clay",
    "claymation",
    "plasticine",
    "puppet",
    "puppetry",
    "object animation",
    "object-animation",
  ].some((term) => value.includes(term));
}

export function filterFilmsByQuickFilter(
  films: Film[],
  activeQuickFilter: QuickFilter,
  awardWinningFilmIdSet: Set<string>
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

  if (activeQuickFilter === "stop-motion") {
    return films.filter((film) => isStopMotionTechnique(film.technique));
  }

  if (activeQuickFilter === "sci-fi") {
    return films.filter((film) => film.quick_filters?.includes("sci-fi"));
  }

  if (activeQuickFilter === "connection") {
    return films.filter((film) =>
      film.quick_filters?.includes("connection")
    );
  }

  if (activeQuickFilter === "distance") {
    return films.filter((film) =>
      film.quick_filters?.includes("distance")
    );
  }

  return films;
}