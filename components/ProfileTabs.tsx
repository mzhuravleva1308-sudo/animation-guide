"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilmScore } from "@/lib/profile-film-scoring";
import { Film } from "@/types/film";
import { getFilmRating } from "@/lib/film-ratings";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";
import FilmSearch from "@/components/FilmSearch";
import FilmCard from "@/components/FilmCard";
import { filmSearchConstants } from "@/lib/film-search.mjs";
import QuickFilters, { QuickFilter } from "@/components/QuickFilters";

export type ProfileTab = "all" | "saved" | "rated";

type ProfileTasteCore = {
  id: string;
  core_index: number;
  core_type: string | null;
  name: string | null;
  strength: number;
  coverage: number | null;
  maturity: string | null;
  nearest_moods: string[] | null;
  emotional_profile_tags?: string[] | null;
  aesthetic_profile_tags?: string[] | null;
};

type ProfileTabsProps = {
  profileSlug: string;
  profileId: string;
  token: string;
  profileName: string;
  tasteProfile: string | null;
  tasteProfileUpdatedAt: string | null;
  tasteCores: ProfileTasteCore[];
  allFilmsSorted: Film[];
  allFilmsScores: Record<string, FilmScore>;
  awardWinningFilmIds: string[];
  isColdStartMode: boolean;
  savedFilms: Film[];
  watchedFilms: Film[];
  allFilmsPageSize: number;
  filmRatings?: Record<string, number>;
  showDebugScores?: boolean;
  loadError?: string | null;
};

const TAB_LABELS: Array<{ id: ProfileTab; label: string }> = [
  { id: "all", label: "All films" },
  { id: "saved", label: "Saved" },
  { id: "rated", label: "Watched" },
];

function getCoreProfileTags(core: ProfileTasteCore) {
  if (core.core_type === "emotional") {
    return core.emotional_profile_tags ?? core.nearest_moods ?? [];
  }

  if (core.core_type === "aesthetic") {
    return core.aesthetic_profile_tags ?? core.nearest_moods ?? [];
  }

  return core.nearest_moods ?? [];
}

function tabButtonClass(isActive: boolean) {
  return `rounded-full border px-4 py-2 text-sm font-medium ${
    isActive
      ? "border-black bg-black text-white"
      : "border-gray-300 bg-white text-gray-700"
  }`;
}

function buildInitialRatingOrder(watchedFilms: Film[]): Record<string, number> {
  const order: Record<string, number> = {};

  watchedFilms.forEach((film, index) => {
    order[film.id] = index;
  });

  return order;
}

function isStopMotionTechnique(technique: string | null | undefined) {
  const value = (technique ?? "").toLowerCase();

  return [
    "stop motion",
    "stop-motion",
    "stopmotion",
    "clay",
    "claymation",
    "plasticine",
    "puppet",
    "puppetry",
    "object animation",
    "object-animation",
  ].some((term) => value.includes(term));
}

export default function ProfileTabs({
  profileSlug,
  profileId,
  token,
  profileName,
  tasteProfile,
  tasteProfileUpdatedAt,
  tasteCores,
  allFilmsSorted,
  allFilmsScores,
  awardWinningFilmIds,
  isColdStartMode,
  savedFilms,
  watchedFilms,
  allFilmsPageSize,
  filmRatings = {},
  showDebugScores = false,
  loadError,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("all");
  const [activeQuickFilter, setActiveQuickFilter] =useState<QuickFilter>(null);
  const [allFilmsPage, setAllFilmsPage] = useState(1);
  const [localSavedFilms, setLocalSavedFilms] = useState(savedFilms);
  const [localFilmRatings, setLocalFilmRatings] = useState(filmRatings);
  const [localRatingOrder, setLocalRatingOrder] = useState<Record<string, number>>(
    () => buildInitialRatingOrder(watchedFilms)
  );
  const [searchState, setSearchState] = useState({
    query: "",
    films: [] as Film[],
    isLoading: false,
    isActive: false,
    error: null as string | null,
  });
  const lastRatingOrderRef = useRef<Record<string, number>>({});

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

  useEffect(() => {
    setLocalSavedFilms(savedFilms);
  }, [savedFilms]);

  useEffect(() => {
    setLocalFilmRatings(filmRatings);
    setLocalRatingOrder(buildInitialRatingOrder(watchedFilms));
  }, [filmRatings, watchedFilms]);

  const savedFilmIds = useMemo(
    () => new Set(localSavedFilms.map((film) => film.id)),
    [localSavedFilms]
  );

  const handleSavedChange = useCallback((film: Film, saved: boolean) => {
    setLocalSavedFilms((prev) => {
      if (saved) {
        if (prev.some((item) => item.id === film.id)) {
          return prev;
        }

        return [...prev, film];
      }

      return prev.filter((item) => item.id !== film.id);
    });
  }, []);

  const handleRatingChange = useCallback(
    (
      filmId: string,
      rating: number | null,
      options?: { skipOrderUpdate?: boolean }
    ) => {
      setLocalFilmRatings((prev) => {
        const next = { ...prev };

        if (rating == null) {
          delete next[filmId];
        } else {
          next[filmId] = rating;
        }

        return next;
      });

      setLocalRatingOrder((prev) => {
        if (rating == null) {
          if (filmId in prev) {
            lastRatingOrderRef.current[filmId] = prev[filmId];
          }

          const next = { ...prev };
          delete next[filmId];
          return next;
        }

        if (options?.skipOrderUpdate) {
          if (filmId in prev) {
            return prev;
          }

          const restoredOrder = lastRatingOrderRef.current[filmId];
          if (restoredOrder != null) {
            return { ...prev, [filmId]: restoredOrder };
          }

          return { ...prev, [filmId]: Date.now() };
        }

        return { ...prev, [filmId]: Date.now() };
      });
    },
    []
  );

  const ratedFilmIds = useMemo(
    () => new Set(Object.keys(localFilmRatings)),
    [localFilmRatings]
  );

  const awardWinningFilmIdSet = useMemo(
    () => new Set(awardWinningFilmIds),
    [awardWinningFilmIds]
  );

  const localAllFilmsSorted = useMemo(() => {
    const unratedFromServerList = allFilmsSorted.filter(
      (film) => !ratedFilmIds.has(film.id)
    );
    const serverUnratedIds = new Set(allFilmsSorted.map((film) => film.id));
    const returnedToQueue = watchedFilms.filter(
      (film) => !ratedFilmIds.has(film.id) && !serverUnratedIds.has(film.id)
    );

    return [...unratedFromServerList, ...returnedToQueue];
  }, [allFilmsSorted, watchedFilms, ratedFilmIds]);

  const quickFilteredAllFilms = useMemo(() => {
    if (activeQuickFilter === "recent") {
      const currentYear = new Date().getFullYear();
      const recentYearFrom = currentYear - 2;
  
      return localAllFilmsSorted.filter(
        (film) =>
          typeof film.year === "number" &&
          film.year >= recentYearFrom &&
          film.year <= currentYear
      );
    }
  
    if (activeQuickFilter === "stop-motion") {
      return localAllFilmsSorted.filter((film) =>
        isStopMotionTechnique(film.technique)
      );
    }
  
    if (activeQuickFilter === "award-winners") {
      return localAllFilmsSorted.filter((film) =>
        awardWinningFilmIdSet.has(film.id)
      );
    }
    
    return localAllFilmsSorted;
  }, [
    activeQuickFilter,
    localAllFilmsSorted,
    awardWinningFilmIdSet,
  ]);


  const localWatchedFilms = useMemo(() => {
    const watchedById = new Map(watchedFilms.map((film) => [film.id, film]));

    for (const film of allFilmsSorted) {
      if (ratedFilmIds.has(film.id)) {
        watchedById.set(film.id, film);
      }
    }

    for (const filmId of watchedById.keys()) {
      if (!ratedFilmIds.has(filmId)) {
        watchedById.delete(filmId);
      }
    }

    return Array.from(watchedById.values()).sort(
      (a, b) =>
        (localRatingOrder[b.id] ?? 0) - (localRatingOrder[a.id] ?? 0)
    );
  }, [allFilmsSorted, watchedFilms, ratedFilmIds, localRatingOrder]);

  const totalAllFilmsCount = quickFilteredAllFilms.length;

  const allFilmsTotalPages = Math.max(
    1,
    Math.ceil(totalAllFilmsCount / allFilmsPageSize)
  );
  const allFilmsCurrentPage = Math.min(allFilmsPage, allFilmsTotalPages);

  const isSearchActive = searchState.isActive;
  const isSearchReady =
    searchState.query.length >= filmSearchConstants.MIN_QUERY_LENGTH;
  const isAllFilmsSearchActive =
    activeTab === "all" && isSearchActive && isSearchReady;

  const { films, scores } = useMemo(() => {
    if (isAllFilmsSearchActive) {
      return {
        films: searchState.films,
        scores: {} as Record<string, FilmScore>,
      };
    }

    if (activeTab === "saved") {
      return { films: localSavedFilms, scores: {} as Record<string, FilmScore> };
    }

    if (activeTab === "rated") {
      return { films: localWatchedFilms, scores: {} as Record<string, FilmScore> };
    }

    const start = (allFilmsCurrentPage - 1) * allFilmsPageSize;
    const end = start + allFilmsPageSize;

    return {
      films: quickFilteredAllFilms.slice(start, end),
      scores: allFilmsScores,
    };
  }, [
    activeTab,
    allFilmsCurrentPage,
    allFilmsPageSize,
    isAllFilmsSearchActive,
    quickFilteredAllFilms,
    allFilmsScores,
    localSavedFilms,
    localWatchedFilms,
    searchState.films,
  ]);

  function handleQuickFilterChange(filter: QuickFilter) {
    setActiveQuickFilter(filter);
    setAllFilmsPage(1);
  }
  
  function handleTabChange(tab: ProfileTab) {
    setActiveTab(tab);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        {TAB_LABELS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={tabButtonClass(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "all" && (
        <div className="mb-6 min-h-5">
          {!isAllFilmsSearchActive && totalAllFilmsCount > 0 && (
            <p className="text-sm text-gray-500">
              {totalAllFilmsCount} films in the guide
            </p>
          )}
        </div>
      )}

      {activeTab === "rated" && (
        <p className="mb-6 text-sm text-gray-500">
          Showing {localWatchedFilms.length} watched{" "}
          {localWatchedFilms.length === 1 ? "film" : "films"}
        </p>
      )}

      {activeTab === "rated" && localWatchedFilms.length > 0 && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="mb-1 text-sm font-medium text-gray-500">
            What the system knows about you
          </p>

          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            {profileName}’s taste profile
          </h2>

          <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-gray-700">
            {tasteProfile ??
              "No AI taste profile yet. Generate one from your rated films."}
          </p>

          {tasteProfileUpdatedAt && (
            <p className="mt-3 text-xs text-gray-400">
              Last updated:{" "}
              {new Date(tasteProfileUpdatedAt).toLocaleDateString()}
            </p>
          )}

          <UpdateTasteProfileButton profileSlug={profileSlug} token={token} />
        </section>
      )}

      {showDebugScores && activeTab === "all" && tasteCores.length > 0 && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-4 text-sm font-medium text-gray-700">
            Taste cores detected from your ratings
          </p>

          <div className="space-y-4">
            {[...tasteCores]
              .sort((a, b) => {
                const order = { emotional: 0, aesthetic: 1 };

                return (
                  (order[a.core_type as "emotional" | "aesthetic"] ?? 99) -
                  (order[b.core_type as "emotional" | "aesthetic"] ?? 99)
                );
              })
              .map((core) => {
                const coreProfileTags = getCoreProfileTags(core);

                return (
                  <div key={`${core.core_type}-${core.core_index}`}>
                    {coreProfileTags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {coreProfileTags.slice(0, 10).map((tag) => (
                          <span
                            key={tag}
                            className={`rounded-full border px-3 py-1 text-sm ${
                              core.core_type === "aesthetic"
                                ? "border-stone-200 bg-stone-100 text-stone-700"
                                : "border-gray-200 bg-gray-50 text-gray-600"
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {activeTab === "all" && (
        <>
          <FilmSearch
            onResultsChange={handleSearchResultsChange}
            isLoading={searchState.isLoading}
          />
          <QuickFilters
            activeFilter={activeQuickFilter}
            onFilterChange={handleQuickFilterChange}
            availableFilters={["all", "recent", "award-winners", "stop-motion"]}
          />
          <div className="mb-6 min-h-5" aria-live="polite">
            {searchState.error && isAllFilmsSearchActive && (
              <p className="text-sm text-red-600" data-testid="film-search-error">
                {searchState.error}
              </p>
            )}

            {isAllFilmsSearchActive &&
              !searchState.isLoading &&
              !searchState.error &&
              films.length > 0 && (
              <p
                className="text-sm text-gray-500"
                data-testid="film-search-results-count"
              >
                {films.length} {films.length === 1 ? "film" : "films"} matched “
                {searchState.query}”.
              </p>
            )}

            {isSearchActive &&
              searchState.query.length > 0 &&
              searchState.query.length < filmSearchConstants.MIN_QUERY_LENGTH && (
              <p className="text-sm text-gray-500" data-testid="film-search-hint">
                Type at least {filmSearchConstants.MIN_QUERY_LENGTH} characters to search.
              </p>
            )}
          </div>
        </>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {loadError}
        </div>
      )}

      {!loadError &&
        !searchState.isLoading &&
        !films.length &&
        !(activeTab === "all" && isSearchActive && !isSearchReady) && (
        <div
          data-testid={
            isAllFilmsSearchActive ? "film-search-empty" : "profile-tab-empty"
          }
          className="rounded-2xl border border-dashed p-8 text-gray-500"
        >
          {isAllFilmsSearchActive
            ? `No films matched “${searchState.query}”. Try a partial title, director name, year, country, or mood tag.`
            : activeTab === "saved"
              ? "No saved films yet."
              : activeTab === "rated"
                ? "No watched films yet."
                : "No films yet. Add your first one."}
        </div>
      )}

      <section
        data-testid={isAllFilmsSearchActive ? "film-search-results" : "film-list"}
        className="grid gap-4"
      >
        {films.map((film, index) => {
          const score = scores[film.id] ?? null;
          const reason =
            !isAllFilmsSearchActive && activeTab === "all" && isColdStartMode
              ? film.cold_start_note ?? undefined
              : undefined;

          return (
            <FilmCard
              key={film.id}
              mode="profile"
              film={film}
              profileId={profileId}
              profileSlug={profileSlug}
              initialRating={getFilmRating(localFilmRatings, film.id)}
              savedFilmIds={savedFilmIds}
              onSavedChange={handleSavedChange}
              onRatingChange={handleRatingChange}
              score={score}
              reason={reason}
              showDebugScores={showDebugScores}
              lazyLoadPoster={index >= 3}
            />
          );
        })}
      </section>

      {activeTab === "all" && !isAllFilmsSearchActive && totalAllFilmsCount > 0 && (
        <nav
          aria-label="All films pagination"
          className="mt-8 flex items-center justify-center gap-4"
        >
          {allFilmsCurrentPage > 1 ? (
            <button
              type="button"
              onClick={() => setAllFilmsPage(allFilmsCurrentPage - 1)}
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
            Page {allFilmsCurrentPage} of {allFilmsTotalPages}
          </span>

          {allFilmsCurrentPage < allFilmsTotalPages ? (
            <button
              type="button"
              onClick={() => setAllFilmsPage(allFilmsCurrentPage + 1)}
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
