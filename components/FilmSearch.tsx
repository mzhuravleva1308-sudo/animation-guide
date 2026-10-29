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

const SEARCH_FIELD_CLASS =
  "h-[34px] w-full rounded-full border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] py-0 pr-3 pl-9 font-sans text-[13px] font-normal tracking-tight text-[#2f3040] shadow-none outline-none backdrop-blur-[14px] placeholder:text-[#9a9baf] transition-[border-color,box-shadow] hover:border-[rgba(177,169,217,0.48)] focus:border-[rgba(177,169,217,0.55)] focus:ring-2 focus:ring-[rgba(177,169,217,0.18)] focus:outline-none focus-visible:border-[rgba(177,169,217,0.55)] focus-visible:outline-none";

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
    const trimmed = debouncedQuery.trim();
    const isActive = trimmed.length > 0;

    if (trimmed.length < filmSearchConstants.MIN_QUERY_LENGTH) {
      onResultsChange({
        query: trimmed,
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
        query: trimmed,
        films: [],
        isLoading: true,
        isActive: true,
        error: null,
      });

      try {
        const response = await fetch(
          `/api/search-films?q=${encodeURIComponent(trimmed)}`,
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
          query: trimmed,
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
          query: trimmed,
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

    document.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [closeSuggestions]);

  const showLoading = isDebouncing || isLoading;

  return (
    <section
      ref={searchRootRef}
      className={`relative mb-0 w-full max-w-[18.5rem] shrink-0 sm:max-w-[20rem] ${
        showSuggestionsDropdown ? "z-[60]" : ""
      }`}
      data-testid="film-search"
    >
      <div className="relative w-full min-w-0">
        <Search
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-[#8b8c9e]"
        />
        <input
          ref={inputRef}
          id="film-search-input"
          data-testid="film-search-input"
          type="search"
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
              if (showSuggestionsDropdown) {
                closeSuggestions();
                return;
              }

              if (query.trim().length > 0) {
                setQuery("");
                setDebouncedQuery("");
                return;
              }

              inputRef.current?.blur();
            }
          }}
          placeholder="Search films, directors, festivals, themes..."
          aria-label="Search by title, director, or mood"
          className={SEARCH_FIELD_CLASS}
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestionsDropdown}
          aria-controls="film-search-suggestions-listbox"
        />
        <span
          data-testid="film-search-loading"
          aria-hidden={!showLoading}
          className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-[#8b8c9e] ${
            showLoading ? "visible" : "invisible"
          }`}
        >
          Searching…
        </span>

        {showSuggestionsDropdown && (
          <div
            data-testid="film-search-suggestions-dropdown"
              className="absolute top-full right-0 left-0 z-[60] mt-2 overflow-hidden rounded-[14px] border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.92)] shadow-[0_8px_28px_rgba(35,36,61,0.1)] backdrop-blur-[14px]"
          >
            <ul
              id="film-search-suggestions-listbox"
              role="listbox"
              className="max-h-56 overflow-y-auto py-1"
            >
              {suggestionsLoading && suggestions.length === 0 && (
                <li className="px-3 py-2 text-xs text-[#8b8c9e]">
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
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[#2f3040] hover:bg-[rgba(255,255,255,0.55)]"
                  >
                    <span className="truncate">{suggestion.label}</span>
                    <span className="shrink-0 text-xs capitalize text-[#8b8c9e]">
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
