"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isDebouncing = query.trim() !== debouncedQuery;
  const trimmedQuery = query.trim();
  const isExpanded = expanded || trimmedQuery.length > 0;
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

  const expandSearch = useCallback(() => {
    setExpanded(true);
  }, []);

  const collapseIfIdle = useCallback(() => {
    if (query.trim().length > 0) {
      return;
    }

    setExpanded(false);
    setSuggestionsOpen(false);
  }, [query]);

  const applySearchQuery = useCallback((nextQuery: string) => {
    const normalizedQuery = nextQuery.trim();
    setQuery(normalizedQuery);
    setDebouncedQuery(normalizedQuery);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setExpanded(true);
  }, []);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isExpanded]);

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

        if (!cancelled) {
          setSuggestions([]);
        }
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

    async function runSearch() {
      onResultsChange({
        query: trimmedQuery,
        films: [],
        isLoading: true,
        isActive: true,
        error: null,
      });

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
          (searchError instanceof DOMException &&
            searchError.name === "AbortError")
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
        collapseIfIdle();
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
  }, [closeSuggestions, collapseIfIdle]);

  const showLoading = isDebouncing || isLoading;

  return (
    <section
      ref={searchRootRef}
      className={
        isExpanded
          ? "relative mb-0 w-[10.125rem] shrink-0 sm:w-[9.75rem]"
          : "relative mb-0 shrink-0"
      }
      data-testid="film-search"
    >
      {!isExpanded ? (
        <button
          type="button"
          data-testid="film-search-expand"
          aria-label="Search films"
          onClick={expandSearch}
          className="inline-flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-[#eef0f8] text-slate-700 transition hover:bg-[#e5e7f4] hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <Search size={11} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <div className="relative w-full min-w-0">
          <Search
            size={11}
            strokeWidth={2}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 text-slate-500"
          />
          <input
            ref={inputRef}
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
                collapseIfIdle();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (showSuggestionsDropdown) {
                  closeSuggestions();
                  return;
                }

                if (query.trim().length > 0) {
                  setQuery("");
                  setDebouncedQuery("");
                  return;
                }

                collapseIfIdle();
                inputRef.current?.blur();
              }
            }}
            placeholder="Search…"
            aria-label="Search by title, director, or mood"
            className="h-[27px] w-full min-w-0 rounded-none border-0 border-b border-slate-200 bg-transparent py-0 pl-4 pr-12 text-[13px] font-normal text-slate-900 placeholder:text-slate-500 shadow-none outline-none transition-[border-color,width] focus:border-slate-400 focus:outline-none focus:shadow-none focus-visible:border-slate-400 focus-visible:outline-none focus-visible:shadow-none"
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestionsDropdown}
            aria-controls="film-search-suggestions-listbox"
          />
          <span
            data-testid="film-search-loading"
            aria-hidden={!showLoading}
            className={`pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[8.25px] text-slate-500 ${
              showLoading ? "visible" : "invisible"
            }`}
          >
            Searching…
          </span>

          {showSuggestionsDropdown && (
            <div
              data-testid="film-search-suggestions-dropdown"
              className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <ul
                id="film-search-suggestions-listbox"
                role="listbox"
                className="max-h-56 overflow-y-auto py-1"
              >
                {suggestionsLoading && suggestions.length === 0 && (
                  <li className="px-3 py-2 text-xs text-slate-400">
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
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
                    >
                      <span className="truncate">{suggestion.label}</span>
                      <span className="shrink-0 text-xs capitalize text-slate-400">
                        {suggestion.type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
