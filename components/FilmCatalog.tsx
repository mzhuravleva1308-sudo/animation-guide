"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Film } from "@/types/film";
import FilmSearch from "@/components/FilmSearch";
import VibeSearch, { vibeSearchUiConstants } from "@/components/VibeSearch";
import FilmCard from "@/components/FilmCard";
import { filmSearchConstants } from "@/lib/film-search.mjs";
import QuickFilters, { QuickFilter } from "@/components/QuickFilters";
import {
  filterFilmsByQuickFilter,
  getQuickFiltersForMedia,
  QUICK_FILTER_DESCRIPTIONS,
} from "@/lib/quick-film-filters";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";
import { useRatingOnboarding } from "@/lib/use-rating-onboarding";
import { MEDIA_TYPE, type MediaType } from "@/lib/media-type";

type FilmCatalogInteractionProps = {
  profileId?: string;
  profileSlug?: string;
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number | null>;
  /** False while authenticated ratings are still loading from the server. */
  ratingsReady?: boolean;
  /**
   * Full catalog film IDs for this media (including already-rated). Used so
   * onboarding can detect 7+ ratings even when rated films are hidden.
   */
  ratingOnboardingFilmIds?: Iterable<string>;
  onSavedChange: (film: Film, saved: boolean) => void;
  onRatingChange: (
    filmId: string,
    rating: number | null,
    options?: { skipOrderUpdate?: boolean }
  ) => void;
  onAuthRequired?: (action: PendingFilmActionInput) => void;
};

type FilmCatalogProps = {
  films: Film[];
  /** Recent arrivals matched to taste; hidden while search/filter is active. */
  freshTastePicks?: Film[];
  /** When smart/smart-cross, label the main queue as taste-sorted. */
  rankingMode?: "smart" | "smart-cross" | "cold-start";
  awardWinningFilmIds: string[];
  pageSize: number;
  loadError?: string | null;
  /** e.g. "Updated Mar 2026" — shown next to the film count. */
  catalogUpdatedShortLabel?: string | null;
  interaction?: FilmCatalogInteractionProps;
  /** Controls which quick-filter chips are shown (Stop motion vs Landscapes). */
  mediaType?: MediaType;
  activeQuickFilter: QuickFilter;
  onQuickFilterChange: (filter: QuickFilter) => void;
  /** Early-access free-form mood search (allowlisted accounts). */
  showVibeSearch?: boolean;
};

function CatalogSectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <h2
        id={id}
        className="font-sans text-[13px] font-medium leading-none tracking-tight text-[#5c5d6e] antialiased [font-synthesis:none]"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-xl font-sans text-[13px] font-normal leading-snug tracking-tight text-[#8b8c9e] antialiased [font-synthesis:none]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export default function FilmCatalog({
  films,
  freshTastePicks = [],
  rankingMode = "cold-start",
  awardWinningFilmIds,
  pageSize,
  loadError,
  catalogUpdatedShortLabel = null,
  interaction,
  mediaType = MEDIA_TYPE.animation,
  activeQuickFilter,
  onQuickFilterChange,
  showVibeSearch = false,
}: FilmCatalogProps) {
  const [page, setPage] = useState(1);
  const availableQuickFilters = useMemo(
    () => getQuickFiltersForMedia(mediaType),
    [mediaType]
  );
  const [searchState, setSearchState] = useState({
    query: "",
    films: [] as Film[],
    isLoading: false,
    isActive: false,
    error: null as string | null,
    mode: "lookup" as "lookup" | "vibe",
  });
  const [vibeState, setVibeState] = useState({
    query: "",
    films: [] as Film[],
    isLoading: false,
    isActive: false,
    error: null as string | null,
  });
  const ratingOnboardingFilmIds = useMemo(() => {
    if (interaction?.ratingOnboardingFilmIds) {
      return interaction.ratingOnboardingFilmIds;
    }
    return films.map((film) => film.id);
  }, [films, interaction?.ratingOnboardingFilmIds]);

  const { getHintForIndex, onDismissRatingOnboarding } = useRatingOnboarding(
    interaction?.filmRatings,
    {
      enabled: Boolean(interaction),
      ratingsReady: interaction?.ratingsReady ?? true,
      mediaType,
      scopeFilmIds: ratingOnboardingFilmIds,
    }
  );

  useEffect(() => {
    setPage(1);
  }, [availableQuickFilters, activeQuickFilter]);

  const awardWinningFilmIdSet = useMemo(
    () => new Set(awardWinningFilmIds),
    [awardWinningFilmIds]
  );

  const quickFilteredFilms = useMemo(
    () =>
      filterFilmsByQuickFilter(
        films,
        activeQuickFilter,
        awardWinningFilmIdSet
      ),
    [films, activeQuickFilter, awardWinningFilmIdSet]
  );
  
  function handleQuickFilterChange(filter: QuickFilter) {
    onQuickFilterChange(filter);
    setPage(1);
  }

  const handleSearchResultsChange = useCallback(
    (nextState: {
      query: string;
      films: Film[];
      isLoading: boolean;
      isActive: boolean;
      error: string | null;
    }) => {
      setSearchState({ ...nextState, mode: "lookup" });
    },
    []
  );

  const handleVibeResultsChange = useCallback(
    (nextState: {
      query: string;
      films: Film[];
      isLoading: boolean;
      isActive: boolean;
      error: string | null;
      mode: "vibe";
    }) => {
      setVibeState({
        query: nextState.query,
        films: nextState.films,
        isLoading: nextState.isLoading,
        isActive: nextState.isActive,
        error: nextState.error,
      });
    },
    []
  );

  const vibeReady =
    vibeState.isActive &&
    vibeState.query.length >= vibeSearchUiConstants.MIN_QUERY_LENGTH;
  const lookupReady =
    searchState.isActive &&
    searchState.query.length >= filmSearchConstants.MIN_QUERY_LENGTH &&
    !vibeReady;
  const isSearchActive = vibeReady || lookupReady || vibeState.isActive || searchState.isActive;
  const isSearchReady = vibeReady || lookupReady;
  const activeSearch = vibeReady
    ? { ...vibeState, mode: "vibe" as const }
    : { ...searchState, mode: "lookup" as const };

  const totalCount = quickFilteredFilms.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);

  const filmRatings = interaction?.filmRatings;

  const visibleFilms = useMemo(() => {
    const excludeRated = (list: Film[]) => {
      if (!filmRatings) {
        return list;
      }

      return list.filter((film) => typeof filmRatings[film.id] !== "number");
    };

    if (isSearchActive && isSearchReady) {
      return excludeRated(activeSearch.films);
    }

    const start = (currentPage - 1) * pageSize;
    return quickFilteredFilms.slice(start, start + pageSize);
  }, [
    quickFilteredFilms,
    currentPage,
    pageSize,
    isSearchActive,
    isSearchReady,
    activeSearch.films,
    filmRatings,
  ]);

  const isShowingSearchResults = isSearchActive && isSearchReady;
  const showFreshTastePicks =
    freshTastePicks.length > 0 &&
    !activeQuickFilter &&
    !isSearchActive &&
    !loadError;
  const isTasteSorted =
    rankingMode === "smart" || rankingMode === "smart-cross";
  const showTasteSortedHeading =
    isTasteSorted &&
    !isSearchActive &&
    !loadError &&
    (visibleFilms.length > 0 || showFreshTastePicks);

  const searchLoading = activeSearch.isLoading || (vibeReady && vibeState.isLoading);

  return (
    <>
      {showVibeSearch && mediaType === MEDIA_TYPE.animation ? (
        <VibeSearch onResultsChange={handleVibeResultsChange} />
      ) : null}

      <div className={activeQuickFilter ? "mb-3" : "mb-[18px]"}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <FilmSearch
              onResultsChange={handleSearchResultsChange}
              isLoading={lookupReady && searchState.isLoading}
            />
            <QuickFilters
              activeFilter={activeQuickFilter}
              onFilterChange={handleQuickFilterChange}
              availableFilters={availableQuickFilters}
            />
          </div>
          {!isShowingSearchResults && totalCount > 0 ? (
            <p
              className="shrink-0 translate-y-[9px] whitespace-nowrap font-sans text-[13px] font-normal leading-none tracking-tight text-[#5c5d6e] antialiased [font-synthesis:none]"
              data-testid="catalog-film-count"
            >
              {totalCount} {totalCount === 1 ? "film" : "films"}
              {catalogUpdatedShortLabel ? (
                <span data-testid="catalog-updated-short-label">
                  {" "}
                  · {catalogUpdatedShortLabel}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {activeQuickFilter ? (
          <p
            data-testid="quick-filter-description"
            className="mt-3.5 max-w-xl font-sans text-[14px] font-normal leading-snug tracking-tight text-[#8b8c9e] antialiased [font-synthesis:none]"
          >
            {QUICK_FILTER_DESCRIPTIONS[activeQuickFilter]}
          </p>
        ) : null}
      </div>

      {vibeState.isLoading ? (
        <div
          className="mb-4 grid gap-3"
          data-testid="vibe-search-results-loading"
          aria-busy="true"
          aria-live="polite"
        >
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="grid gap-5 rounded-2xl border border-gray-100 p-5 md:grid-cols-[160px_1fr]"
            >
              <div className="h-56 w-full animate-pulse rounded-xl bg-gray-200 md:h-60" />
              <div className="space-y-4">
                <div className="h-7 w-2/3 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-4 w-1/2 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-20 w-full animate-pulse rounded-xl bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!vibeState.isLoading &&
      ((activeSearch.error && isShowingSearchResults) ||
        (isShowingSearchResults &&
          !searchLoading &&
          !activeSearch.error &&
          visibleFilms.length > 0) ||
        (lookupReady === false &&
          searchState.isActive &&
          searchState.query.length > 0 &&
          searchState.query.length < filmSearchConstants.MIN_QUERY_LENGTH &&
          !vibeReady)) ? (
        <div className="mb-2.5 min-h-0" aria-live="polite">
          {activeSearch.error && isShowingSearchResults && (
            <p className="text-sm text-red-600" data-testid="film-search-error">
              {activeSearch.error}
            </p>
          )}

          {isShowingSearchResults &&
            !searchLoading &&
            !activeSearch.error &&
            visibleFilms.length > 0 && (
              <p
                className="text-sm text-slate-500"
                data-testid="film-search-results-count"
              >
                {visibleFilms.length}{" "}
                {visibleFilms.length === 1 ? "film" : "films"} matched “
                {activeSearch.query}”
                {activeSearch.mode === "vibe" ? " by feeling" : ""}.
              </p>
            )}

          {!vibeReady &&
            searchState.isActive &&
            searchState.query.length > 0 &&
            searchState.query.length < filmSearchConstants.MIN_QUERY_LENGTH && (
              <p className="text-sm text-slate-500" data-testid="film-search-hint">
                Type at least {filmSearchConstants.MIN_QUERY_LENGTH} characters to
                search.
              </p>
            )}
        </div>
      ) : null}

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {loadError}
        </div>
      )}

      {showFreshTastePicks && !vibeState.isLoading ? (
        <section
          data-testid="fresh-taste-picks"
          className="mb-10 border-b border-[#e4e2f0] pb-10"
          aria-labelledby="fresh-taste-picks-heading"
        >
          <CatalogSectionHeading
            id="fresh-taste-picks-heading"
            title="New for you"
            description="Recently added titles closest to your taste."
          />
          <div className="grid gap-4">
            {freshTastePicks.map((film, index) => (
              <FilmCard
                key={film.id}
                mode={interaction ? "catalog" : "public"}
                film={film}
                lazyLoadPoster={index >= 1}
                profileId={interaction?.profileId}
                profileSlug={interaction?.profileSlug}
                initialRating={interaction?.filmRatings[film.id] ?? null}
                savedFilmIds={interaction?.savedFilmIds ?? new Set()}
                onSavedChange={
                  interaction?.onSavedChange ??
                  (() => {
                    /* no-op */
                  })
                }
                onRatingChange={
                  interaction?.onRatingChange ??
                  (() => {
                    /* no-op */
                  })
                }
                onAuthRequired={interaction?.onAuthRequired}
                ratingOnboardingHint={getHintForIndex(index)}
                onDismissRatingOnboarding={onDismissRatingOnboarding}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!loadError &&
        !searchLoading &&
        !visibleFilms.length &&
        !showFreshTastePicks &&
        !(isSearchActive && !isSearchReady) && (
          <div
            data-testid={
              isShowingSearchResults ? "film-search-empty" : "film-catalog-empty"
            }
            className="rounded-2xl border border-dashed p-8 text-gray-500"
          >
            {isShowingSearchResults
              ? activeSearch.mode === "vibe"
                ? `No films matched “${activeSearch.query}” by feeling. Try a clearer contrast — care vs hard world, magic in the everyday.`
                : `No films matched “${activeSearch.query}”. Try a partial title, director name, year, country, or mood tag.`
              : activeQuickFilter
                ? "No films match this filter."
                : "No films in the catalog yet."}
          </div>
        )}

      {!vibeState.isLoading ? (
      <section
        data-testid={isShowingSearchResults ? "film-search-results" : "film-list"}
        aria-labelledby={
          showTasteSortedHeading ? "taste-sorted-catalog-heading" : undefined
        }
      >
        {showTasteSortedHeading ? (
          <CatalogSectionHeading
            id="taste-sorted-catalog-heading"
            title="Matched to your taste"
            description="The rest of the catalog, ranked for you."
          />
        ) : null}
        <div className="grid gap-4">
          {visibleFilms.map((film, index) => {
            const onboardingIndex = showFreshTastePicks
              ? index + freshTastePicks.length
              : index;
            return (
              <FilmCard
                key={film.id}
                mode={interaction ? "catalog" : "public"}
                film={film}
                lazyLoadPoster={onboardingIndex >= 1}
                profileId={interaction?.profileId}
                profileSlug={interaction?.profileSlug}
                initialRating={interaction?.filmRatings[film.id] ?? null}
                savedFilmIds={interaction?.savedFilmIds ?? new Set()}
                onSavedChange={
                  interaction?.onSavedChange ??
                  (() => {
                    /* no-op */
                  })
                }
                onRatingChange={
                  interaction?.onRatingChange ??
                  (() => {
                    /* no-op */
                  })
                }
                onAuthRequired={interaction?.onAuthRequired}
                ratingOnboardingHint={getHintForIndex(onboardingIndex)}
                onDismissRatingOnboarding={onDismissRatingOnboarding}
              />
            );
          })}
        </div>
      </section>
      ) : null}

      {!vibeState.isLoading && !isShowingSearchResults && totalCount > 0 && (
        <nav
          aria-label="Catalog pagination"
          className="mt-8 flex items-center justify-center gap-4"
        >
          {currentPage > 1 ? (
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
          ) : (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400">
              Previous
            </span>
          )}

          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>

          {currentPage < totalPages ? (
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </button>
          ) : (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400">
              Next
            </span>
          )}
        </nav>
      )}
    </>
  );
}
