"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { LoaderCircle, Search } from "lucide-react";
import { Film } from "@/types/film";

const MIN_QUERY_LENGTH = 4;

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
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const trimmedQuery = query.trim();
  const canSubmit =
    trimmedQuery.length >= MIN_QUERY_LENGTH &&
    !isLoading &&
    trimmedQuery !== submittedQuery;

  const resetResults = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setIsLoading(false);
    setSubmittedQuery(null);
    onResultsChange({
      query: "",
      films: [],
      isLoading: false,
      isActive: false,
      error: null,
      mode: "vibe",
    });
  }, [onResultsChange]);

  const runSearch = useCallback(
    async (activeQuery: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setIsLoading(true);
      setSubmittedQuery(activeQuery);
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

        if (requestId !== requestIdRef.current) return;

        setIsLoading(false);
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
          requestId !== requestIdRef.current ||
          (searchError instanceof DOMException &&
            searchError.name === "AbortError")
        ) {
          return;
        }

        setIsLoading(false);
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
    },
    [onResultsChange]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (trimmedQuery.length < MIN_QUERY_LENGTH || isLoading) return;
      if (trimmedQuery === submittedQuery) return;
      void runSearch(trimmedQuery);
    },
    [trimmedQuery, isLoading, submittedQuery, runSearch]
  );

  return (
    <section className="mb-4" data-testid="vibe-search">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor="vibe-search-input">
          Search by feeling
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id="vibe-search-input"
              data-testid="vibe-search-input"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              disabled={isLoading}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && (query.length > 0 || submittedQuery)) {
                  event.preventDefault();
                  setQuery("");
                  resetResults();
                }
              }}
              placeholder={PLACEHOLDER}
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 pr-10 text-[14px] font-normal text-slate-900 placeholder:text-slate-400 shadow-none outline-none transition-[border-color,opacity] focus:border-slate-400 focus:outline-none disabled:cursor-wait disabled:opacity-70"
            />
            {isLoading ? (
              <LoaderCircle
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                data-testid="vibe-search-spinner"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500"
              />
            ) : null}
          </div>
          <button
            type="submit"
            data-testid="vibe-search-submit"
            disabled={!canSubmit}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#2f3040] px-4 text-[13px] font-medium text-white transition enabled:hover:bg-[#1f2030] enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-offset-2 enabled:focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            Find
          </button>
          {submittedQuery ? (
            <button
              type="button"
              data-testid="vibe-search-clear"
              disabled={isLoading}
              onClick={() => {
                setQuery("");
                resetResults();
              }}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              Clear
            </button>
          ) : null}
        </div>
      </form>

      {isLoading ? (
        <div
          className="mt-3 rounded-xl border border-slate-200 bg-[#f7f7fb] px-3.5 py-3"
          data-testid="vibe-search-loading"
          aria-live="polite"
        >
          <p className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
            <LoaderCircle
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className="animate-spin text-slate-500"
            />
            Finding films that match this feeling…
          </p>
          <p className="mt-1 text-[12px] leading-snug text-slate-500">
            Translating your mood and ranking against your taste — usually a few
            seconds.
          </p>
        </div>
      ) : (
        <p
          className="mt-2 max-w-2xl font-sans text-[12px] font-normal leading-snug tracking-tight text-[#8b8c9e] antialiased [font-synthesis:none]"
          data-testid="vibe-search-hint"
        >
          Free-form mood search. Press Find when the feeling is ready — not a
          title. Already rated films are hidden.
        </p>
      )}
    </section>
  );
}

export const vibeSearchUiConstants = {
  MIN_QUERY_LENGTH,
  PLACEHOLDER,
};
