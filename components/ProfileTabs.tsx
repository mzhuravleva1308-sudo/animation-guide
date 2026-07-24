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

function tabNavItemClass(isActive: boolean) {
  return `inline-flex h-9 shrink-0 items-center bg-transparent px-0.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
    isActive
      ? "font-medium text-slate-900"
      : "font-normal text-slate-700 hover:text-slate-900"
  }`;
}

function TabIcon({ tab }: { tab: ProfileTab }) {
  const iconProps = {
    className: "shrink-0",
    size: 18 as const,
    strokeWidth: 2 as const,
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
  const displayName = profileName?.trim() || null;
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
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl flex-1">
          <h1 className="text-3xl font-semibold">
            {displayName ? `${displayName}’s Animation Guide` : "Animation Guide"}
          </h1>
          <p className="mt-2 text-gray-600">
            Find strange, beautiful, and emotionally resonant animated films to
            watch next.
          </p>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3 sm:gap-0">
          <nav
            aria-label="Profile film lists"
            className="flex max-w-full flex-wrap items-center justify-end gap-4 sm:gap-5"
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
                  <span className="relative inline-flex items-center gap-1.5 whitespace-nowrap">
                    <TabIcon tab={tab.id} />
                    <span>{tab.label}</span>
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-0 bottom-[-6px] left-0 h-px bg-slate-900"
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>
          <span
            aria-hidden="true"
            className="ml-3 mr-3 hidden h-5 w-px shrink-0 self-center bg-slate-200 sm:block"
          />
          {accountMenu}
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
          <FilmSearch
            onResultsChange={handleSearchResultsChange}
            isLoading={searchState.isLoading}
          />
          <QuickFilters
            activeFilter={activeQuickFilter}
            onFilterChange={handleQuickFilterChange}
            availableFilters={QUICK_FILTERS}
          />
          <div className="mt-3 mb-4 min-h-5" aria-live="polite">
            {!isAllFilmsSearchActive && totalAllFilmsCount > 0 && (
              <p className="text-sm text-gray-500">
                {totalAllFilmsCount} films in the guide
              </p>
            )}

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

      {activeTab === "rated" && (
        <p className="mb-4 text-sm text-gray-500">
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
