"use client";

import { useCallback, useEffect, useState } from "react";
import { Film } from "@/types/film";

const MIN_QUERY_LENGTH = 4;
const SEARCH_DEBOUNCE_MS = 450;

const PLACEHOLDER =
  "Describe a feeling — e.g. забота в сложном мире, волшебство в обыденности";

type VibeSearchResult = {
  film: Film;
  score: number;
  why?: string | null;
};

type VibeSearchResponse = {
  query: string;
  results: VibeSearchResult[];
  count: number;
  message?: string;
  error?: string;
};

type VibeSearchProps = {
  onResultsChange: (results: {
    query: string;
    films: Film[];
    isLoading: boolean;
    isActive: boolean;
    error: string | null;
    mode: "vibe";
  }) => void;
};

export default function VibeSearch({ onResultsChange }: VibeSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const isDebouncing = query.trim() !== debouncedQuery;
  const trimmedQuery = query.trim();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const activeQuery = debouncedQuery.trim();
    const isActive = activeQuery.length > 0;

    if (activeQuery.length < MIN_QUERY_LENGTH) {
      onResultsChange({
        query: activeQuery,
        films: [],
        isLoading: false,
        isActive,
        error: null,
        mode: "vibe",
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function runSearch() {
      onResultsChange({
        query: activeQuery,
        films: [],
        isLoading: true,
        isActive: true,
        error: null,
        mode: "vibe",
      });

      try {
        const response = await fetch(
          `/api/search-vibe?q=${encodeURIComponent(activeQuery)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as VibeSearchResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Vibe search failed");
        }

        if (cancelled) return;

        onResultsChange({
          query: activeQuery,
          films: payload.results.map((result) => result.film),
          isLoading: false,
          isActive: true,
          error: null,
          mode: "vibe",
        });
      } catch (searchError) {
        if (
          cancelled ||
          (searchError instanceof DOMException &&
            searchError.name === "AbortError")
        ) {
          return;
        }

        onResultsChange({
          query: activeQuery,
          films: [],
          isLoading: false,
          isActive: true,
          error:
            searchError instanceof Error
              ? searchError.message
              : "Vibe search failed",
          mode: "vibe",
        });
      }
    }

    runSearch();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery, onResultsChange]);

  const clearQuery = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  return (
    <section className="mb-4" data-testid="vibe-search">
      <label className="sr-only" htmlFor="vibe-search-input">
        Search by feeling
      </label>
      <div className="relative">
        <input
          id="vibe-search-input"
          data-testid="vibe-search-input"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query.length > 0) {
              clearQuery();
            }
          }}
          placeholder={PLACEHOLDER}
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 pr-20 text-[14px] font-normal text-slate-900 placeholder:text-slate-400 shadow-none outline-none transition-[border-color] focus:border-slate-400 focus:outline-none"
        />
        <span
          data-testid="vibe-search-loading"
          aria-hidden={!isDebouncing}
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 ${
            isDebouncing ? "visible" : "invisible"
          }`}
        >
          Searching…
        </span>
      </div>
      <p
        className="mt-2 max-w-2xl font-sans text-[12px] font-normal leading-snug tracking-tight text-[#8b8c9e] antialiased [font-synthesis:none]"
        data-testid="vibe-search-hint"
      >
        Free-form mood search. Name a feeling and contrast — not a title. Already
        rated films are hidden.
      </p>
    </section>
  );
}

export const vibeSearchUiConstants = {
  MIN_QUERY_LENGTH,
  PLACEHOLDER,
};
