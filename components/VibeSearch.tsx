"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { LoaderCircle, Search, Sparkles } from "lucide-react";
import { RESONALE_LAVENDER } from "@/components/ResonaleBrand";
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
  /** Allowlisted signed-in users can expand and search. */
  unlocked?: boolean;
  /** Guests: open auth instead of expanding. */
  onAuthRequired?: () => void;
};

export default function VibeSearch({
  onResultsChange,
  unlocked = true,
  onAuthRequired,
}: VibeSearchProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const trimmedQuery = query.trim();
  const canSubmit =
    trimmedQuery.length >= MIN_QUERY_LENGTH &&
    !isLoading &&
    trimmedQuery !== submittedQuery;
  const isExpanded = expanded || isLoading || Boolean(submittedQuery);

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

  const collapseIfIdle = useCallback(() => {
    if (isLoading || submittedQuery || trimmedQuery.length > 0) return;
    setExpanded(false);
  }, [isLoading, submittedQuery, trimmedQuery]);

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

  useEffect(() => {
    if (!isExpanded) return;
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isExpanded]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (trimmedQuery.length < MIN_QUERY_LENGTH || isLoading) return;
      if (trimmedQuery === submittedQuery) return;
      void runSearch(trimmedQuery);
    },
    [trimmedQuery, isLoading, submittedQuery, runSearch]
  );

  if (!isExpanded) {
    return (
      <section className="relative mb-0 shrink-0" data-testid="vibe-search">
        <button
          type="button"
          data-testid="vibe-search-expand"
          aria-label="AI Search"
          title="AI Search"
          onClick={() => {
            if (!unlocked) {
              onAuthRequired?.();
              return;
            }
            setExpanded(true);
          }}
          className="inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 font-sans text-[13px] font-medium tracking-tight transition hover:brightness-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          style={{
            backgroundColor: "#efeaf8",
            color: "#6b5ea8",
          }}
        >
          <Sparkles
            size={13}
            strokeWidth={2}
            style={{ color: RESONALE_LAVENDER }}
            aria-hidden="true"
          />
          AI Search
        </button>
      </section>
    );
  }

  return (
    <section
      className="relative mb-0 w-full basis-full"
      data-testid="vibe-search"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <label className="sr-only" htmlFor="vibe-search-input">
          Search by feeling
        </label>
        <div className="relative min-w-0 flex-1">
          <Sparkles
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2"
            style={{ color: RESONALE_LAVENDER }}
          />
          <input
            ref={inputRef}
            id="vibe-search-input"
            data-testid="vibe-search-input"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            disabled={isLoading}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => {
              // Defer so Find / Clear clicks still register.
              window.setTimeout(() => collapseIfIdle(), 0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (query.length > 0 || submittedQuery) {
                  setQuery("");
                  resetResults();
                }
                setExpanded(false);
              }
            }}
            placeholder={PLACEHOLDER}
            autoComplete="off"
            className="h-[34px] w-full rounded-full border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] py-0 pr-10 pl-9 font-sans text-[13px] font-normal tracking-tight text-[#2f3040] shadow-none outline-none backdrop-blur-[14px] placeholder:text-[#9a9baf] transition-[border-color,box-shadow,opacity] hover:border-[rgba(177,169,217,0.48)] focus:border-[rgba(177,169,217,0.55)] focus:ring-2 focus:ring-[rgba(177,169,217,0.18)] focus:outline-none disabled:cursor-wait disabled:opacity-70"
          />
          {isLoading ? (
            <LoaderCircle
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              data-testid="vibe-search-spinner"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-[#8b8c9e]"
            />
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="submit"
            data-testid="vibe-search-submit"
            disabled={!canSubmit}
            className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#2f3040] px-4 text-[13px] font-medium text-white transition enabled:hover:bg-[#1f2030] enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-offset-2 enabled:focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:flex-none"
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
                setExpanded(false);
              }}
              className="inline-flex h-[34px] items-center justify-center rounded-full border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] px-3 text-[13px] font-medium text-[#5c5d6e] backdrop-blur-[14px] transition hover:bg-[rgba(255,255,255,0.8)] hover:text-[#2f3040] disabled:cursor-wait disabled:opacity-60"
            >
              Clear
            </button>
          ) : (
            <button
              type="button"
              data-testid="vibe-search-collapse"
              disabled={isLoading}
              onClick={() => {
                setExpanded(false);
              }}
              className="inline-flex h-[34px] items-center justify-center rounded-full border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] px-3 text-[13px] font-medium text-[#5c5d6e] backdrop-blur-[14px] transition hover:bg-[rgba(255,255,255,0.8)] hover:text-[#2f3040] disabled:cursor-wait disabled:opacity-60"
            >
              Close
            </button>
          )}
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
      ) : null}
    </section>
  );
}

export const vibeSearchUiConstants = {
  MIN_QUERY_LENGTH,
  PLACEHOLDER,
};
