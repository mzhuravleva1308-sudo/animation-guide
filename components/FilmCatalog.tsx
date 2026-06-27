"use client";

import { useCallback, useMemo, useState } from "react";
import { Film } from "@/types/film";
import FilmSearch from "@/components/FilmSearch";
import FilmCard from "@/components/FilmCard";
import { filmSearchConstants } from "@/lib/film-search.mjs";
import QuickFilters, { QuickFilter } from "@/components/QuickFilters";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";

type FilmCatalogInteractionProps = {
  profileId?: string;
  profileSlug?: string;
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number | null>;
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

  const awardWinningFilmIdSet = useMemo(
    () => new Set(awardWinningFilmIds),
    [awardWinningFilmIds]
  );
  
  const quickFilteredFilms = useMemo(() => {
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
  
    return films;
  }, [activeQuickFilter, awardWinningFilmIdSet, films]);
  
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
      <div className="mb-6 min-h-5">
        {totalCount > 0 && (
          <p className="text-sm text-gray-500">
            {totalCount} films in the catalog
          </p>
        )}
      </div>

      <FilmSearch
        onResultsChange={handleSearchResultsChange}
        isLoading={searchState.isLoading}
      />
      <QuickFilters
        activeFilter={activeQuickFilter}
        onFilterChange={handleQuickFilterChange}
        availableFilters={["all", "recent", "award-winners"]}
      />

      <div className="mb-6 min-h-5" aria-live="polite">
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
              className="text-sm text-gray-500"
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
            <p className="text-sm text-gray-500" data-testid="film-search-hint">
              Type at least {filmSearchConstants.MIN_QUERY_LENGTH} characters to
              search.
            </p>
          )}
      </div>

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
