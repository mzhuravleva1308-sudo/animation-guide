"use client";

import { useCallback, useMemo, useState } from "react";
import { Film } from "@/types/film";
import FilmSearch from "@/components/FilmSearch";
import FilmCard from "@/components/FilmCard";
import { filmSearchConstants } from "@/lib/film-search.mjs";

type FilmCatalogProps = {
  films: Film[];
  pageSize: number;
  loadError?: string | null;
};

export default function FilmCatalog({
  films,
  pageSize,
  loadError,
}: FilmCatalogProps) {
  const [page, setPage] = useState(1);
  const [searchState, setSearchState] = useState({
    query: "",
    films: [] as Film[],
    isLoading: false,
    isActive: false,
    error: null as string | null,
  });

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

  const totalCount = films.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);

  const visibleFilms = useMemo(() => {
    if (isSearchActive && isSearchReady) {
      return searchState.films;
    }

    const start = (currentPage - 1) * pageSize;
    return films.slice(start, start + pageSize);
  }, [
    films,
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
            mode="public"
            film={film}
            lazyLoadPoster={index >= 3}
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
