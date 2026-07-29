"use client";

import { useCallback, useMemo, useState } from "react";
import { Film } from "@/types/film";
import FilmSearch from "@/components/FilmSearch";
import FilmCard from "@/components/FilmCard";
import { filmSearchConstants } from "@/lib/film-search.mjs";
import QuickFilters, { QuickFilter } from "@/components/QuickFilters";
import {
  filterFilmsByQuickFilter,
  QUICK_FILTER_DESCRIPTIONS,
  QUICK_FILTERS,
} from "@/lib/quick-film-filters";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";
import { useRatingOnboarding } from "@/lib/use-rating-onboarding";

type FilmCatalogInteractionProps = {
  profileId?: string;
  profileSlug?: string;
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number | null>;
  /** False while authenticated ratings are still loading from the server. */
  ratingsReady?: boolean;
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
  awardWinningFilmIds: string[];
  pageSize: number;
  loadError?: string | null;
  interaction?: FilmCatalogInteractionProps;
};

export default function FilmCatalog({
  films,
  awardWinningFilmIds,
  pageSize,
  loadError,
  interaction,
}: FilmCatalogProps) {
  const [page, setPage] = useState(1);
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>(null);
  const [searchState, setSearchState] = useState({
    query: "",
    films: [] as Film[],
    isLoading: false,
    isActive: false,
    error: null as string | null,
  });
  const { getHintForIndex, onDismissRatingOnboarding } = useRatingOnboarding(
    interaction?.filmRatings,
    {
      enabled: Boolean(interaction),
      ratingsReady: interaction?.ratingsReady ?? true,
    }
  );

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
    setActiveQuickFilter(filter);
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
      setSearchState(nextState);
    },
    []
  );

  const isSearchActive = searchState.isActive;
  const isSearchReady =
    searchState.query.length >= filmSearchConstants.MIN_QUERY_LENGTH;

  const totalCount = quickFilteredFilms.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);

  const visibleFilms = useMemo(() => {
    if (isSearchActive && isSearchReady) {
      return searchState.films;
    }

    const start = (currentPage - 1) * pageSize;
    return quickFilteredFilms.slice(start, start + pageSize);
  }, [
    quickFilteredFilms,
    currentPage,
    pageSize,
    isSearchActive,
    isSearchReady,
    searchState.films,
  ]);

  const isShowingSearchResults = isSearchActive && isSearchReady;

  return (
    <>
      <div className={activeQuickFilter ? "mb-3" : "mb-[18px]"}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <FilmSearch
              onResultsChange={handleSearchResultsChange}
              isLoading={searchState.isLoading}
            />
            <QuickFilters
              activeFilter={activeQuickFilter}
              onFilterChange={handleQuickFilterChange}
              availableFilters={QUICK_FILTERS}
            />
          </div>
          {!isShowingSearchResults && totalCount > 0 ? (
            <p className="shrink-0 translate-y-[9px] whitespace-nowrap font-sans text-[13px] font-normal leading-none tracking-tight text-[#5c5d6e] antialiased [font-synthesis:none]">
              {totalCount} {totalCount === 1 ? "film" : "films"}
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

      {(searchState.error && isShowingSearchResults) ||
      (isShowingSearchResults &&
        !searchState.isLoading &&
        !searchState.error &&
        visibleFilms.length > 0) ||
      (isSearchActive &&
        searchState.query.length > 0 &&
        searchState.query.length < filmSearchConstants.MIN_QUERY_LENGTH) ? (
        <div className="mb-2.5 min-h-0" aria-live="polite">
          {searchState.error && isShowingSearchResults && (
            <p className="text-sm text-red-600" data-testid="film-search-error">
              {searchState.error}
            </p>
          )}

          {isShowingSearchResults &&
            !searchState.isLoading &&
            !searchState.error &&
            visibleFilms.length > 0 && (
              <p
                className="text-sm text-slate-500"
                data-testid="film-search-results-count"
              >
                {visibleFilms.length}{" "}
                {visibleFilms.length === 1 ? "film" : "films"} matched “
                {searchState.query}”.
              </p>
            )}

          {isSearchActive &&
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

      {!loadError &&
        !searchState.isLoading &&
        !visibleFilms.length &&
        !(isSearchActive && !isSearchReady) && (
          <div
            data-testid={
              isShowingSearchResults ? "film-search-empty" : "film-catalog-empty"
            }
            className="rounded-2xl border border-dashed p-8 text-gray-500"
          >
            {isShowingSearchResults
              ? `No films matched “${searchState.query}”. Try a partial title, director name, year, country, or mood tag.`
              : "No films in the catalog yet."}
          </div>
        )}

      <section
        data-testid={isShowingSearchResults ? "film-search-results" : "film-list"}
        className="grid gap-4"
      >
        {visibleFilms.map((film, index) => (
          <FilmCard
            key={film.id}
            mode={interaction ? "catalog" : "public"}
            film={film}
            lazyLoadPoster={index >= 3}
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
      </section>

      {!isShowingSearchResults && totalCount > 0 && (
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
