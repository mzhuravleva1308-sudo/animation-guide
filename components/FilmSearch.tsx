"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const searchRootRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const isDebouncing = query.trim() !== debouncedQuery;
  const trimmedQuery = query.trim();
  const canShowSuggestions =
    trimmedQuery.length >= filmSearchConstants.MIN_QUERY_LENGTH &&
    (suggestions.length > 0 || suggestionsLoading);
  const showSuggestionsDropdown = suggestionsOpen && canShowSuggestions;

  const closeSuggestions = useCallback(() => {
    setSuggestionsOpen(false);
  }, []);

  const openSuggestions = useCallback(() => {
    setSuggestionsOpen(true);
  }, []);

  const applySearchQuery = useCallback((nextQuery: string) => {
    const normalizedQuery = nextQuery.trim();
    setQuery(normalizedQuery);
    setDebouncedQuery(normalizedQuery);
    setSuggestions([]);
    setSuggestionsOpen(false);
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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!searchRootRef.current?.contains(event.target as Node)) {
        closeSuggestions();
      }
    }

    function handleScroll() {
      closeSuggestions();
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [closeSuggestions]);

  const showLoading = isDebouncing || isLoading;

  return (
    <section
      ref={searchRootRef}
      className="mb-6 w-full min-w-0"
      data-testid="film-search"
    >
      <div className="relative w-full min-w-0">
        <input
          id="film-search-input"
          data-testid="film-search-input"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            openSuggestions();
          }}
          onFocus={openSuggestions}
          onBlur={(event) => {
            const relatedTarget = event.relatedTarget as Node | null;
            if (!searchRootRef.current?.contains(relatedTarget)) {
              closeSuggestions();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeSuggestions();
            }
          }}
          placeholder="Search by title, director, year, country, technique, mood, or tag…"
          aria-label="Search by title, director, year, country, technique, mood, or tag"
          className="w-full min-w-0 rounded-full border border-gray-300 bg-white px-4 py-3 pr-24 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestionsDropdown}
          aria-controls="film-search-suggestions-listbox"
        />
        <span
          data-testid="film-search-loading"
          aria-hidden={!showLoading}
          className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 ${
            showLoading ? "visible" : "invisible"
          }`}
        >
          Searching…
        </span>

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
                    onMouseDown={(event) => event.preventDefault()}
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
