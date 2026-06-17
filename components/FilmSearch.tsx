"use client";

import { useCallback, useEffect, useState } from "react";
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

type SearchSuggestion = {
  label: string;
  type: string;
  score: number;
};

type SearchSuggestionsResponse = {
  query: string;
  suggestions: SearchSuggestion[];
  count: number;
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
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const isDebouncing = query.trim() !== debouncedQuery;
  const trimmedQuery = query.trim();
  const showSuggestionsDropdown =
    trimmedQuery.length >= filmSearchConstants.MIN_QUERY_LENGTH &&
    (suggestions.length > 0 || suggestionsLoading);

  const applySearchQuery = useCallback((nextQuery: string) => {
    const normalizedQuery = nextQuery.trim();
    setQuery(normalizedQuery);
    setDebouncedQuery(normalizedQuery);
    setSuggestions([]);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const activeQuery = debouncedQuery.trim();

    if (activeQuery.length < filmSearchConstants.MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadSuggestions() {
      setSuggestionsLoading(true);

      try {
        const response = await fetch(
          `/api/search-film-suggestions?q=${encodeURIComponent(activeQuery)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as SearchSuggestionsResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Suggestions failed");
        }

        if (cancelled) {
          return;
        }

        setSuggestions(payload.suggestions);
      } catch (suggestionError) {
        if (
          cancelled ||
          (suggestionError instanceof DOMException &&
            suggestionError.name === "AbortError")
        ) {
          return;
        }

        setSuggestions([]);
      } finally {
        if (!cancelled) {
          setSuggestionsLoading(false);
        }
      }
    }

    loadSuggestions();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery]);

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
          role="combobox"
          aria-expanded={showSuggestionsDropdown}
          aria-controls="film-search-suggestions-listbox"
        />
        {showLoading && (
          <span
            data-testid="film-search-loading"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400"
          >
            Searching…
          </span>
        )}

        {showSuggestionsDropdown && (
          <div
            data-testid="film-search-suggestions-dropdown"
            className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
          >
            <ul
              id="film-search-suggestions-listbox"
              role="listbox"
              className="max-h-56 overflow-y-auto py-1"
            >
              {suggestionsLoading && suggestions.length === 0 && (
                <li className="px-4 py-2 text-xs text-gray-400">
                  Finding suggestions…
                </li>
              )}
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.type}-${suggestion.label}`} role="none">
                  <button
                    type="button"
                    role="option"
                    data-testid="film-search-suggestion-item"
                    onClick={() => applySearchQuery(suggestion.label)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                  >
                    <span className="truncate">{suggestion.label}</span>
                    <span className="shrink-0 text-xs capitalize text-gray-400">
                      {suggestion.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
