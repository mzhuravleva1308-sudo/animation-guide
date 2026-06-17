"use client";

import { useEffect, useState } from "react";
import { Film } from "@/types/film";
import { filmSearchConstants } from "@/lib/film-search.mjs";

type SearchFilmResult = {
  film: Film;
  score: number;
  matchedFields: string[];
};

type FilmSearchResponse = {
  query: string;
  results: SearchFilmResult[];
  count: number;
  message?: string;
  error?: string;
};

type FilmSearchProps = {
  onResultsChange: (results: {
    query: string;
    films: Film[];
    isLoading: boolean;
    isActive: boolean;
    error: string | null;
  }) => void;
  isLoading?: boolean;
};

const SEARCH_DEBOUNCE_MS = 300;

export default function FilmSearch({
  onResultsChange,
  isLoading = false,
}: FilmSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const isDebouncing = query.trim() !== debouncedQuery;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const trimmedQuery = debouncedQuery.trim();
    const isActive = trimmedQuery.length > 0;

    if (trimmedQuery.length < filmSearchConstants.MIN_QUERY_LENGTH) {
      onResultsChange({
        query: trimmedQuery,
        films: [],
        isLoading: false,
        isActive,
        error: null,
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    onResultsChange({
      query: trimmedQuery,
      films: [],
      isLoading: true,
      isActive: true,
      error: null,
    });

    async function runSearch() {
      try {
        const response = await fetch(
          `/api/search-films?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );

        const payload = (await response.json()) as FilmSearchResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Search failed");
        }

        if (cancelled) {
          return;
        }

        onResultsChange({
          query: trimmedQuery,
          films: payload.results.map((result) => result.film),
          isLoading: false,
          isActive: true,
          error: null,
        });
      } catch (searchError) {
        if (
          cancelled ||
          (searchError instanceof DOMException && searchError.name === "AbortError")
        ) {
          return;
        }

        const message =
          searchError instanceof Error
            ? searchError.message
            : "Search failed";

        onResultsChange({
          query: trimmedQuery,
          films: [],
          isLoading: false,
          isActive: true,
          error: message,
        });
      }
    }

    runSearch();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery, onResultsChange]);

  const showLoading = isDebouncing || isLoading;

  return (
    <section className="mb-6" data-testid="film-search">
      <label
        htmlFor="film-search-input"
        className="mb-2 block text-sm font-medium text-gray-700"
      >
        Search the film database
      </label>
      <div className="relative">
        <input
          id="film-search-input"
          data-testid="film-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title, director, year, country, technique, mood, or tag…"
          className="w-full rounded-full border border-gray-300 bg-white px-4 py-3 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
          autoComplete="off"
        />
        {showLoading && (
          <span
            data-testid="film-search-loading"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400"
          >
            Searching…
          </span>
        )}
      </div>
    </section>
  );
}
