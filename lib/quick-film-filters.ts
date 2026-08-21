import type { QuickFilter, QuickFilterOption } from "@/components/QuickFilters";
import { Film } from "@/types/film";
import { MEDIA_TYPE, type MediaType } from "@/lib/media-type";
import {
  LIVE_ACTION_QUICK_FILTERS as LIVE_ACTION_QUICK_FILTERS_RAW,
  QUICK_FILTER_DESCRIPTIONS as QUICK_FILTER_DESCRIPTIONS_RAW,
  QUICK_FILTERS as QUICK_FILTERS_RAW,
  filterFilmsByQuickFilter as filterFilmsByQuickFilterRaw,
  getQuickFiltersForMedia as getQuickFiltersForMediaRaw,
  isAllowedQuickFilter as isAllowedQuickFilterRaw,
  isStopMotionTechnique as isStopMotionTechniqueRaw,
} from "./quick-film-filters.mjs";

export const QUICK_FILTERS = QUICK_FILTERS_RAW as QuickFilterOption[];

/** Live-action catalog: Landscapes replaces Stop motion in the same slot. */
export const LIVE_ACTION_QUICK_FILTERS =
  LIVE_ACTION_QUICK_FILTERS_RAW as QuickFilterOption[];

export function getQuickFiltersForMedia(
  mediaType: MediaType = MEDIA_TYPE.animation
): QuickFilterOption[] {
  return getQuickFiltersForMediaRaw(mediaType) as QuickFilterOption[];
}

export const QUICK_FILTER_DESCRIPTIONS =
  QUICK_FILTER_DESCRIPTIONS_RAW as Record<QuickFilterOption, string>;

export const isStopMotionTechnique = isStopMotionTechniqueRaw as (
  technique: string | null | undefined
) => boolean;

export function isAllowedQuickFilter(
  filter: QuickFilter,
  availableFilters: QuickFilterOption[]
) {
  return isAllowedQuickFilterRaw(filter, availableFilters);
}

export function filterFilmsByQuickFilter(
  films: Film[],
  activeQuickFilter: QuickFilter,
  awardWinningFilmIdSet: Set<string>
) {
  return filterFilmsByQuickFilterRaw(
    films,
    activeQuickFilter,
    awardWinningFilmIdSet
  ) as Film[];
}
