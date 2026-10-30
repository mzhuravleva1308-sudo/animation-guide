"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { RESONALE_LAVENDER } from "@/components/ResonaleBrand";
import { Film } from "@/types/film";

const MIN_QUERY_LENGTH = 4;

const PLACEHOLDER =
  "Describe a feeling — care in a hard world, magic in the everyday";

const FIELD_CLASS =
  "h-[34px] w-full rounded-full border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] py-0 pl-9 font-sans text-[13px] font-normal tracking-tight text-[#2f3040] shadow-none outline-none backdrop-blur-[14px] placeholder:text-[#9a9baf] transition-[border-color,box-shadow,opacity] hover:border-[rgba(177,169,217,0.48)] focus:border-[rgba(177,169,217,0.55)] focus:ring-2 focus:ring-[rgba(177,169,217,0.18)] focus:outline-none disabled:cursor-wait disabled:opacity-70";

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
  /** Signed-in users can expand and search. */
  unlocked?: boolean;
  /** Guests: open auth instead of expanding. */
  onAuthRequired?: () => void;
  /** Parent hides title search while the vibe field is open. */
  onExpandedChange?: (expanded: boolean) => void;
};

export default function VibeSearch({
  onResultsChange,
  unlocked = true,
  onAuthRequired,
  onExpandedChange,
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
  const showClear = Boolean(query.length > 0 || submittedQuery);

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

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

  const collapseIdle = useCallback(() => {
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

  const handleClear = useCallback(() => {
    setQuery("");
    resetResults();
    setExpanded(false);
  }, [resetResults]);

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
          className="inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-[rgba(177,169,217,0.45)] bg-[#efeaf8] px-3.5 font-sans text-[13px] font-medium tracking-tight text-[#6b5ea8] transition hover:border-[rgba(177,169,217,0.65)] hover:bg-[#e8e1f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
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
      className="relative mb-0 w-full max-w-[22rem] shrink-0 sm:max-w-[26rem]"
      data-testid="vibe-search"
    >
      <form
        onSubmit={handleSubmit}
        className="flex min-w-0 items-center gap-1.5"
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
              window.setTimeout(() => collapseIdle(), 0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                handleClear();
              }
            }}
            placeholder={PLACEHOLDER}
            autoComplete="off"
            className={`${FIELD_CLASS} ${
              showClear || isLoading ? "pr-10" : "pr-3"
            }`}
          />
          {isLoading ? (
            <LoaderCircle
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              data-testid="vibe-search-spinner"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-[#8b8c9e]"
            />
          ) : showClear ? (
            <button
              type="button"
              data-testid="vibe-search-clear"
              aria-label="Clear AI search"
              onClick={handleClear}
              className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#8b8c9e] transition hover:bg-[rgba(177,169,217,0.16)] hover:text-[#2f3040]"
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          data-testid="vibe-search-submit"
          disabled={!canSubmit}
          className="inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-[rgba(177,169,217,0.45)] bg-[#efeaf8] px-3.5 text-[13px] font-medium text-[#6b5ea8] transition enabled:hover:border-[rgba(177,169,217,0.65)] enabled:hover:bg-[#e8e1f5] enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-offset-2 enabled:focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:border-[rgba(176,178,198,0.35)] disabled:bg-[rgba(255,255,255,0.45)] disabled:text-[#9a9baf]"
        >
          <Search size={14} strokeWidth={2} aria-hidden="true" />
          Find
        </button>
      </form>

      {isLoading ? (
        <p
          className="mt-2 font-sans text-[13px] font-normal leading-snug tracking-tight text-[#8b8c9e] antialiased [font-synthesis:none]"
          data-testid="vibe-search-loading"
          aria-live="polite"
        >
          Matching this feeling to your taste…
        </p>
      ) : null}
    </section>
  );
}

export const vibeSearchUiConstants = {
  MIN_QUERY_LENGTH,
  PLACEHOLDER,
};
