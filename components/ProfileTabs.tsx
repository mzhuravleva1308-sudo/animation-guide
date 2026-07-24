"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FilmScore } from "@/lib/profile-film-scoring";
import { Film } from "@/types/film";
import { getFilmRating } from "@/lib/film-ratings";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";
import FilmSearch from "@/components/FilmSearch";
import FilmCard from "@/components/FilmCard";
import ResonaleBrand from "@/components/ResonaleBrand";
import { filmSearchConstants } from "@/lib/film-search.mjs";
import QuickFilters, { QuickFilter } from "@/components/QuickFilters";
import {
  filterFilmsByQuickFilter,
  QUICK_FILTERS,
} from "@/lib/quick-film-filters";
import {
  Bookmark,
  CircleCheck,
  Film as FilmIcon,
} from "lucide-react";

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
  accountMenu: ReactNode;
};

const TAB_ITEMS: Array<{
  id: ProfileTab;
  label: string;
}> = [
  { id: "all", label: "Films" },
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

function tabNavItemClass(isActive: boolean) {
  return `inline-flex h-[33px] shrink-0 items-center bg-transparent px-0 text-[15px] font-normal tracking-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1B2E] ${
    isActive
      ? "text-[#1A1B2E]"
      : "text-[#5c5d6e] hover:text-[#1A1B2E]"
  }`;
}

function TabIcon({ tab }: { tab: ProfileTab }) {
  const iconProps = {
    className: "shrink-0",
    size: 16 as const,
    strokeWidth: 1.25 as const,
    "aria-hidden": true as const,
  };

  if (tab === "saved") {
    return <Bookmark {...iconProps} />;
  }

  if (tab === "rated") {
    return <CircleCheck {...iconProps} />;
  }

  return <FilmIcon {...iconProps} />;
}

function buildInitialRatingOrder(watchedFilms: Film[]): Record<string, number> {
  const order: Record<string, number> = {};

  watchedFilms.forEach((film, index) => {
    order[film.id] = index;
  });

  return order;
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
  accountMenu,
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
  
  const quickFilteredAllFilms = useMemo(
    () =>
      filterFilmsByQuickFilter(
        localAllFilmsSorted,
        activeQuickFilter,
        awardWinningFilmIdSet
      ),
    [
      localAllFilmsSorted,
      activeQuickFilter,
      awardWinningFilmIdSet,
    ]
  );


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
      <header className="mb-0">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-[15px]">
            <ResonaleBrand />

            <nav
              aria-label="Profile film lists"
              className="flex max-w-full flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-[15px]"
            >
              {TAB_ITEMS.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={tabNavItemClass(isActive)}
                    aria-pressed={isActive}
                  >
                    <span className="relative inline-flex items-center gap-1 whitespace-nowrap">
                      <TabIcon tab={tab.id} />
                      <span>{tab.label}</span>
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute right-0 bottom-[-5px] left-0 h-px bg-[#B1A9D9]"
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center">
            {accountMenu}
          </div>
        </div>

        <div className="mt-6 mb-1.5">
          <h1 className="sr-only">Resonale</h1>
          <p className="whitespace-nowrap font-sans text-[13px] font-normal leading-none tracking-tight text-[#5c5d6e] antialiased [font-synthesis:none]">
            Find strange, beautiful, and emotionally resonant animated films to
            watch next.
          </p>
        </div>
      </header>

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
          <div className="mb-[18px] flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <FilmSearch
                onResultsChange={handleSearchResultsChange}
                isLoading={searchState.isLoading}
              />
              <QuickFilters
                activeFilter={activeQuickFilter}
                onFilterChange={handleQuickFilterChange}
                availableFilters={QUICK_FILTERS}
              />
            </div>
            {!isAllFilmsSearchActive && totalAllFilmsCount > 0 ? (
              <p className="shrink-0 font-sans text-[13px] font-normal leading-none tracking-tight text-[#5c5d6e] antialiased [font-synthesis:none]">
                {totalAllFilmsCount}{" "}
                {totalAllFilmsCount === 1 ? "film" : "films"}
              </p>
            ) : null}
          </div>
          <div className="mb-4 min-h-0" aria-live="polite">
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
                className="text-sm text-slate-500"
                data-testid="film-search-results-count"
              >
                {films.length} {films.length === 1 ? "film" : "films"} matched “
                {searchState.query}”.
              </p>
            )}

            {isSearchActive &&
              searchState.query.length > 0 &&
              searchState.query.length < filmSearchConstants.MIN_QUERY_LENGTH && (
              <p className="text-sm text-slate-500" data-testid="film-search-hint">
                Type at least {filmSearchConstants.MIN_QUERY_LENGTH} characters to search.
              </p>
            )}
          </div>
        </>
      )}

      {activeTab === "rated" && (
        <p className="mb-4 text-sm text-slate-500">
          Showing {localWatchedFilms.length} watched{" "}
          {localWatchedFilms.length === 1 ? "film" : "films"}
        </p>
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
              profileToken={token}
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
