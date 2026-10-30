"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  CircleCheck,
  Clapperboard,
  Film as FilmIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import EmailAuthModal from "@/components/EmailAuthModal";
import FilmCard from "@/components/FilmCard";
import FilmCatalog from "@/components/FilmCatalog";
import { canAccessVibeSearch } from "@/lib/vibe-search-access.mjs";
import { canAccessRatingDetail } from "@/lib/rating-detail-access.mjs";
import { loadFilmRatingDetails } from "@/lib/film-profile-mutations";
import type { FilmRatingDetail } from "@/lib/rating-detail";
import type { QuickFilter } from "@/components/QuickFilters";
import {
  HeaderIconButton,
  HEADER_NAV_ICON,
  headerNavLabelCollapse,
} from "@/components/HeaderIconControl";
import ResonaleBrand, {
  RESONALE_BRAND_TAGLINE,
} from "@/components/ResonaleBrand";
import SiteFooter from "@/components/SiteFooter";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";
import type { AuthUserSummary } from "@/lib/auth/session";
import {
  buildCatalogPath,
  parseCatalogQuickFilter,
  syncCatalogUrl,
} from "@/lib/catalog-url";
import {
  MEDIA_TYPE,
  normalizeMediaType,
  type MediaType,
} from "@/lib/media-type";
import { resolveProfileListTabView } from "@/lib/profile-list-tab-view.mjs";
import { useCatalogFilmInteraction } from "@/lib/use-catalog-film-interaction";
import { Film } from "@/types/film";

type CatalogRankingMode = "smart" | "smart-cross" | "cold-start";

type CatalogSlice = {
  films: Film[];
  freshTastePicks: Film[];
  rankingMode: CatalogRankingMode;
  awardWinningFilmIds: string[];
  loadError: string | null;
};

type CatalogApiPayload = {
  films?: Film[];
  freshTastePicks?: Film[];
  rankingMode?: CatalogRankingMode;
  awardWinningFilmIds?: string[];
  loadError?: string | null;
  scoresLastComputedAt?: string | null;
};

type ListMediaFilter = "all" | MediaType;

/** Score jobs debounce 60s, then cron/worker can take another 1–2 min. */
const SCORE_CATALOG_REFRESH_INITIAL_MS = 70_000;
const SCORE_CATALOG_REFRESH_POLL_MS = 15_000;
const SCORE_CATALOG_REFRESH_DEADLINE_MS = 4 * 60_000;

function catalogSliceKey(media: MediaType): string {
  return `${media}|native`;
}

function filmMediaType(film: Film): MediaType {
  return normalizeMediaType(film.media_type, MEDIA_TYPE.animation);
}

function formatScoresLastComputedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function catalogQuery(media: MediaType): string {
  const params = new URLSearchParams();
  if (media !== MEDIA_TYPE.animation) {
    params.set("media", media);
  }
  return params.toString();
}

async function fetchCatalogPayload(
  media: MediaType
): Promise<CatalogApiPayload | null> {
  try {
    const query = catalogQuery(media);
    const response = await fetch(
      query ? `/api/catalog?${query}` : "/api/catalog"
    );
    if (!response.ok) {
      console.error("[catalog] client fetch failed", response.status);
      return null;
    }
    return (await response.json()) as CatalogApiPayload;
  } catch (error) {
    console.error("[catalog] client fetch error", error);
    return null;
  }
}

function catalogSliceFromPayload(payload: CatalogApiPayload): CatalogSlice {
  return {
    films: payload.films ?? [],
    freshTastePicks: payload.freshTastePicks ?? [],
    rankingMode: payload.rankingMode ?? "cold-start",
    awardWinningFilmIds: payload.awardWinningFilmIds ?? [],
    loadError: payload.loadError ?? null,
  };
}

function newerTimestamp(
  current: string | null,
  incoming: string | null | undefined
): string | null {
  if (typeof incoming !== "string" || incoming.length === 0) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  const currentMs = Date.parse(current);
  const incomingMs = Date.parse(incoming);
  if (!Number.isFinite(incomingMs)) {
    return current;
  }
  if (!Number.isFinite(currentMs) || incomingMs >= currentMs) {
    return incoming;
  }
  return current;
}

function ListTabSkeleton() {
  return (
    <div
      data-testid="profile-tab-loading"
      className="mt-4 grid gap-4"
      aria-busy="true"
      aria-label="Loading list"
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="grid gap-5 rounded-2xl border border-gray-100 p-5 md:grid-cols-[160px_1fr]"
        >
          <div className="h-56 w-full animate-pulse rounded-xl bg-gray-200 md:h-60" />
          <div className="space-y-4">
            <div className="h-7 w-2/3 animate-pulse rounded-xl bg-gray-200" />
            <div className="h-4 w-1/2 animate-pulse rounded-xl bg-gray-200" />
            <div className="h-20 w-full animate-pulse rounded-xl bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

type CatalogTab = "all" | "films" | "saved" | "watched";

type FilmsPageClientProps = {
  auth: AuthUserSummary | null;
  films: Film[];
  /** Recent catalog arrivals ranked to the viewer's taste (signed-in smart mode). */
  freshTastePicks?: Film[];
  /** How the main catalog queue was ranked for this viewer. */
  rankingMode?: CatalogRankingMode;
  awardWinningFilmIds: string[];
  pageSize: number;
  loadError: string | null;
  showSubtitle?: boolean;
  /** SSR-hydrated quick filter from `?filter=`. */
  initialQuickFilter?: QuickFilter;
  /** SSR-hydrated ratings so Watched is ready on first paint. */
  initialFilmRatings?: Record<string, number>;
  /** SSR-hydrated saved ids so Saved is ready on first paint. */
  initialSavedFilmIds?: string[];
  /** SSR film_ratings.updated_at epoch ms — newest Watched first. */
  initialRatingUpdatedAtMs?: Record<string, number>;
  /** SSR profile_film_lists.created_at epoch ms — newest Saved first. */
  initialSavedAtMs?: Record<string, number>;
  /** Newest successful profile↔film score write time (ISO). */
  scoresLastComputedAt?: string | null;
  /** Public catalog freshness label, e.g. "Catalog updated March 2026". */
  catalogUpdatedLabel?: string | null;
  /** Short freshness next to film count, e.g. "Updated Mar 2026". */
  catalogUpdatedShortLabel?: string | null;
  /** Active catalog media (animation default). */
  mediaType?: "animation" | "live_action";
  /** Legacy query value; catalog always ranks native for the active media. */
  sortParam?:
    | "native"
    | "cross_from_animation"
    | "cross_from_live_action";
  /** Films catalog tab is allowlisted (early access). */
  showLiveActionTab?: boolean;
};

function sortFilmsByRecency(
  films: Film[],
  atMsByFilmId: Record<string, number>
): Film[] {
  return [...films].sort(
    (a, b) => (atMsByFilmId[b.id] ?? 0) - (atMsByFilmId[a.id] ?? 0)
  );
}

export default function FilmsPageClient({
  auth: initialAuth,
  films,
  freshTastePicks: initialFreshTastePicks = [],
  rankingMode: initialRankingMode = "cold-start",
  awardWinningFilmIds,
  pageSize,
  loadError,
  showSubtitle = false,
  initialQuickFilter = null,
  initialFilmRatings,
  initialSavedFilmIds,
  initialRatingUpdatedAtMs,
  initialSavedAtMs,
  scoresLastComputedAt = null,
  catalogUpdatedLabel = null,
  catalogUpdatedShortLabel = null,
  mediaType: initialMediaType = MEDIA_TYPE.animation,
  sortParam: _unusedSortParam = "native",
  showLiveActionTab = false,
}: FilmsPageClientProps) {
  const [activeTab, setActiveTab] = useState<CatalogTab>(() =>
    initialMediaType === MEDIA_TYPE.liveAction ? "films" : "all"
  );
  const [activeMedia, setActiveMedia] = useState<MediaType>(initialMediaType);
  const [activeQuickFilter, setActiveQuickFilter] =
    useState<QuickFilter>(initialQuickFilter);
  const catalogPostAuthPath = buildCatalogPath({
    media: activeMedia,
    filter: activeQuickFilter,
  });
  const {
    auth,
    profileId,
    profileSlug,
    tasteProfile,
    tasteProfileUpdatedAt,
    setTasteProfile,
    setTasteProfileUpdatedAt,
    savedFilmIds,
    filmRatings,
    ratingUpdatedAtMs,
    savedAtMs,
    ratingsReady,
    handleSavedChange,
    handleRatingChange,
    handleAuthRequired,
    openAuthModal,
    handleModalClose,
    modalOpen,
    modalLockScrollY,
    modalRestoreFocusElement,
    authTriggerRef,
  } = useCatalogFilmInteraction({
    initialAuth,
    initialFilmRatings,
    initialSavedFilmIds,
    initialRatingUpdatedAtMs,
    initialSavedAtMs,
    postAuthPath: catalogPostAuthPath,
  });
  const [scoresLastComputedAtState, setScoresLastComputedAtState] = useState<
    string | null
  >(scoresLastComputedAt);
  const [ratingDetails, setRatingDetails] = useState<
    Record<string, FilmRatingDetail>
  >({});
  const showRatingDetail = canAccessRatingDetail(auth?.email);
  // Allowlisted live-action early access only: Saved/Watched open on Animation.
  const [listMediaFilter, setListMediaFilter] = useState<ListMediaFilter>(() =>
    showLiveActionTab ? MEDIA_TYPE.animation : "all"
  );
  const [catalogSlices, setCatalogSlices] = useState<
    Record<string, CatalogSlice>
  >(() => ({
    [catalogSliceKey(initialMediaType)]: {
      films,
      freshTastePicks: initialFreshTastePicks,
      rankingMode: initialRankingMode,
      awardWinningFilmIds,
      loadError,
    },
  }));
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogInflightRef = useRef(
    new Map<string, Promise<CatalogSlice | null>>()
  );
  const catalogSlicesRef = useRef(catalogSlices);
  catalogSlicesRef.current = catalogSlices;
  const scoresLastComputedAtRef = useRef(scoresLastComputedAtState);
  const scoresPollTimeoutsRef = useRef<number[]>([]);

  const applyCatalogPayload = useCallback(
    (
      media: MediaType,
      payload: CatalogApiPayload,
      { overwrite }: { overwrite: boolean }
    ) => {
      const key = catalogSliceKey(media);
      const slice = catalogSliceFromPayload(payload);
      setCatalogSlices((current) => {
        if (!overwrite && current[key]) {
          return current;
        }
        return { ...current, [key]: slice };
      });
      const nextComputedAt = newerTimestamp(
        scoresLastComputedAtRef.current,
        payload.scoresLastComputedAt
      );
      scoresLastComputedAtRef.current = nextComputedAt;
      setScoresLastComputedAtState(nextComputedAt);
      return slice;
    },
    []
  );

  const ensureCatalog = useCallback(
    async (media: MediaType) => {
      const key = catalogSliceKey(media);
      const cached = catalogSlicesRef.current[key];
      if (cached) {
        return cached;
      }

      const inflight = catalogInflightRef.current.get(key);
      if (inflight) {
        return inflight;
      }

      const request = (async (): Promise<CatalogSlice | null> => {
        const payload = await fetchCatalogPayload(media);
        if (!payload) {
          return null;
        }
        return applyCatalogPayload(media, payload, { overwrite: false });
      })().finally(() => {
        catalogInflightRef.current.delete(key);
      });

      catalogInflightRef.current.set(key, request);
      return request;
    },
    [applyCatalogPayload]
  );

  const selectCatalog = useCallback(
    async (media: MediaType) => {
      const key = catalogSliceKey(media);
      if (!catalogSlicesRef.current[key]) {
        setCatalogLoading(true);
        await ensureCatalog(media);
        setCatalogLoading(false);
      }
      const nextFilter = parseCatalogQuickFilter(activeQuickFilter, media);
      setActiveMedia(media);
      setActiveTab(media === MEDIA_TYPE.liveAction ? "films" : "all");
      setActiveQuickFilter(nextFilter);
      syncCatalogUrl({ media, filter: nextFilter });
    },
    [activeQuickFilter, ensureCatalog]
  );

  const handleQuickFilterChange = useCallback(
    (filter: QuickFilter) => {
      setActiveQuickFilter(filter);
      syncCatalogUrl({ media: activeMedia, filter });
    },
    [activeMedia]
  );

  useEffect(() => {
    syncCatalogUrl({ media: initialMediaType, filter: initialQuickFilter });
  }, [initialMediaType, initialQuickFilter]);

  useEffect(() => {
    const key = catalogSliceKey(initialMediaType);
    setCatalogSlices((current) => ({
      ...current,
      [key]: {
        films,
        freshTastePicks: initialFreshTastePicks,
        rankingMode: initialRankingMode,
        awardWinningFilmIds,
        loadError,
      },
    }));
  }, [
    initialMediaType,
    films,
    initialFreshTastePicks,
    initialRankingMode,
    awardWinningFilmIds,
    loadError,
  ]);

  useEffect(() => {
    if (!auth && activeTab !== "all" && activeTab !== "films") {
      setActiveTab("all");
    }
  }, [auth, activeTab]);

  // Prefetch the other catalog so Films ↔ Animation feels like a local tab switch.
  useEffect(() => {
    if (!showLiveActionTab) {
      return;
    }
    const otherMedia =
      activeMedia === MEDIA_TYPE.liveAction
        ? MEDIA_TYPE.animation
        : MEDIA_TYPE.liveAction;
    void ensureCatalog(otherMedia);
  }, [showLiveActionTab, activeMedia, ensureCatalog]);

  const refreshPersonalizedCatalog = useCallback(async () => {
    const medias: MediaType[] = showLiveActionTab
      ? [MEDIA_TYPE.animation, MEDIA_TYPE.liveAction]
      : [activeMedia];
    const payloads = await Promise.all(
      medias.map((media) => fetchCatalogPayload(media))
    );
    payloads.forEach((payload, index) => {
      const media = medias[index];
      if (!payload || !media) {
        return;
      }
      applyCatalogPayload(media, payload, { overwrite: true });
    });
  }, [activeMedia, applyCatalogPayload, showLiveActionTab]);

  const clearScoresCatalogPoll = useCallback(() => {
    for (const timeoutId of scoresPollTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    scoresPollTimeoutsRef.current = [];
  }, []);

  const scheduleCatalogRefreshAfterRating = useCallback(() => {
    if (!auth) {
      return;
    }

    clearScoresCatalogPoll();
    const previousComputedAt = scoresLastComputedAtRef.current;
    const deadline = Date.now() + SCORE_CATALOG_REFRESH_DEADLINE_MS;

    const poll = async () => {
      await refreshPersonalizedCatalog();
      const nextComputedAt = scoresLastComputedAtRef.current;
      if (nextComputedAt && nextComputedAt !== previousComputedAt) {
        return;
      }
      if (Date.now() >= deadline) {
        return;
      }
      const timeoutId = window.setTimeout(() => {
        void poll();
      }, SCORE_CATALOG_REFRESH_POLL_MS);
      scoresPollTimeoutsRef.current.push(timeoutId);
    };

    const timeoutId = window.setTimeout(() => {
      void poll();
    }, SCORE_CATALOG_REFRESH_INITIAL_MS);
    scoresPollTimeoutsRef.current.push(timeoutId);
  }, [auth, clearScoresCatalogPoll, refreshPersonalizedCatalog]);

  useEffect(() => () => clearScoresCatalogPoll(), [clearScoresCatalogPoll]);

  useEffect(() => {
    if (!showRatingDetail || !auth?.profile?.id) {
      setRatingDetails({});
      return;
    }

    let cancelled = false;
    void loadFilmRatingDetails().then(({ details, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("Rating details load error", error);
        return;
      }
      setRatingDetails(details);
    });

    return () => {
      cancelled = true;
    };
  }, [auth?.profile?.id, showRatingDetail]);

  const handleRatingDetailChange = useCallback(
    (filmId: string, detail: FilmRatingDetail) => {
      setRatingDetails((current) => ({ ...current, [filmId]: detail }));
    },
    []
  );

  const handleRatingChangeAndRefresh = useCallback(
    (filmId: string, rating: number | null) => {
      handleRatingChange(filmId, rating);
      if (rating === null) {
        setRatingDetails((current) => {
          if (!(filmId in current)) return current;
          const next = { ...current };
          delete next[filmId];
          return next;
        });
      }
      scheduleCatalogRefreshAfterRating();
    },
    [handleRatingChange, scheduleCatalogRefreshAfterRating]
  );

  const handleTabChange = useCallback(
    (tab: CatalogTab) => {
      if ((tab === "saved" || tab === "watched") && !auth) {
        openAuthModal(authTriggerRef.current);
        return;
      }

      if (tab === "all") {
        void selectCatalog(MEDIA_TYPE.animation);
        return;
      }

      if (tab === "films") {
        if (!showLiveActionTab) {
          return;
        }
        void selectCatalog(MEDIA_TYPE.liveAction);
        return;
      }

      setActiveTab(tab);
      if (tab === "watched") {
        void refreshPersonalizedCatalog();
      }
    },
    [
      auth,
      openAuthModal,
      refreshPersonalizedCatalog,
      selectCatalog,
      showLiveActionTab,
    ]
  );

  const isCatalogTab = activeTab === "all" || activeTab === "films";
  const catalogSubtitle =
    activeMedia === MEDIA_TYPE.liveAction
      ? {
          title: "Indie & Festival Films",
          primary:
            "Find distinctive, beautiful and emotionally resonant films to watch next.",
          secondary:
            "Films with a world and pulse of their own, from independent voices and celebrated auteurs.",
        }
      : {
          title: RESONALE_BRAND_TAGLINE,
          primary:
            "Discover strange, beautiful and emotionally resonant animated films to watch next.",
          secondary:
            "Independent, artist-led and festival animation from around the world.",
        };

  const currentSlice = catalogSlices[catalogSliceKey(activeMedia)] ?? null;
  const catalogFilms = currentSlice?.films ?? [];
  const catalogFreshTastePicks = currentSlice?.freshTastePicks ?? [];
  const catalogRankingMode = currentSlice?.rankingMode ?? initialRankingMode;
  const catalogAwardIds = currentSlice?.awardWinningFilmIds ?? [];
  const catalogLoadError = currentSlice?.loadError ?? loadError;

  const libraryFilms = useMemo(() => {
    const byId = new Map<string, Film>();
    for (const slice of Object.values(catalogSlices)) {
      for (const film of slice.films) {
        byId.set(film.id, film);
      }
      for (const film of slice.freshTastePicks) {
        byId.set(film.id, film);
      }
    }
    return Array.from(byId.values());
  }, [catalogSlices]);

  const savedFilms = useMemo(() => {
    const saved = libraryFilms.filter((film) => savedFilmIds.has(film.id));
    const filtered =
      listMediaFilter === "all"
        ? saved
        : saved.filter((film) => filmMediaType(film) === listMediaFilter);
    return sortFilmsByRecency(filtered, savedAtMs);
  }, [libraryFilms, listMediaFilter, savedAtMs, savedFilmIds]);

  const watchedFilms = useMemo(() => {
    const watched = libraryFilms.filter((film) => {
      const rating = filmRatings[film.id];
      return typeof rating === "number";
    });
    const filtered =
      listMediaFilter === "all"
        ? watched
        : watched.filter((film) => filmMediaType(film) === listMediaFilter);
    return sortFilmsByRecency(filtered, ratingUpdatedAtMs);
  }, [filmRatings, libraryFilms, listMediaFilter, ratingUpdatedAtMs]);

  // All/Films queues: rated films leave immediately via optimistic
  // filmRatings updates (no reload), and return when the rating is cleared.
  const unratedFilms = useMemo(
    () =>
      catalogFilms.filter((film) => typeof filmRatings[film.id] !== "number"),
    [catalogFilms, filmRatings]
  );

  const unratedFreshTastePicks = useMemo(
    () =>
      catalogFreshTastePicks.filter(
        (film) => typeof filmRatings[film.id] !== "number"
      ),
    [catalogFreshTastePicks, filmRatings]
  );

  const ratingOnboardingFilmIds = useMemo(() => {
    const ids = new Set(catalogFilms.map((film) => film.id));
    for (const film of catalogFreshTastePicks) {
      ids.add(film.id);
    }
    return ids;
  }, [catalogFilms, catalogFreshTastePicks]);

  const listFilms = activeTab === "saved" ? savedFilms : watchedFilms;
  // ratingsReady covers both filmRatings and savedFilmIds — they load together
  // in loadAuthenticatedProfileFilmState, then pending actions apply before ready.
  const listTabView = resolveProfileListTabView({
    loadError: catalogLoadError,
    listsReady: ratingsReady,
    listLength: listFilms.length,
  });
  const showCatalogSubtitle = showSubtitle && isCatalogTab;
  const animationNav = headerNavLabelCollapse(activeTab === "all");
  const filmsNav = headerNavLabelCollapse(activeTab === "films");
  const savedNav = headerNavLabelCollapse(activeTab === "saved");
  const watchedNav = headerNavLabelCollapse(activeTab === "watched");

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      data-testid="films-page"
      data-ratings-ready={ratingsReady ? "true" : "false"}
    >
      <header className={isCatalogTab ? "mb-0" : "mb-[18px]"}>
        <div className="flex flex-nowrap items-center justify-between gap-1 sm:gap-3">
          <ResonaleBrand
            onClick={() => handleTabChange("all")}
            showTagline={!showCatalogSubtitle}
          />

          <nav
            aria-label="Catalog and lists"
            className="flex shrink-0 items-center gap-0 sm:gap-2 md:gap-3"
          >
            <HeaderIconButton
              label="Animation"
              active={activeTab === "all"}
              labelClassName={animationNav.labelClassName}
              iconActiveClassName={animationNav.iconActiveClassName}
              onClick={() => handleTabChange("all")}
              data-testid="nav-animation"
            >
              <FilmIcon
                size={HEADER_NAV_ICON.size}
                strokeWidth={HEADER_NAV_ICON.strokeWidth}
                fill="none"
                className="shrink-0"
                aria-hidden="true"
              />
            </HeaderIconButton>
            {showLiveActionTab ? (
              <HeaderIconButton
                label="Films"
                active={activeTab === "films"}
                labelClassName={filmsNav.labelClassName}
                iconActiveClassName={filmsNav.iconActiveClassName}
                onClick={() => handleTabChange("films")}
                data-testid="nav-films"
              >
                <Clapperboard
                  size={HEADER_NAV_ICON.size}
                  strokeWidth={HEADER_NAV_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconButton>
            ) : null}
            {auth ? (
              <>
                <HeaderIconButton
                  label="Saved"
                  active={activeTab === "saved"}
                  labelClassName={savedNav.labelClassName}
                  iconActiveClassName={savedNav.iconActiveClassName}
                  onClick={() => handleTabChange("saved")}
                  data-testid="nav-saved"
                >
                  <Bookmark
                    size={HEADER_NAV_ICON.size}
                    strokeWidth={HEADER_NAV_ICON.strokeWidth}
                    fill="none"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                </HeaderIconButton>
                <HeaderIconButton
                  label="Watched"
                  active={activeTab === "watched"}
                  labelClassName={watchedNav.labelClassName}
                  iconActiveClassName={watchedNav.iconActiveClassName}
                  onClick={() => handleTabChange("watched")}
                  data-testid="nav-watched"
                >
                  <CircleCheck
                    size={HEADER_NAV_ICON.size}
                    strokeWidth={HEADER_NAV_ICON.strokeWidth}
                    fill="none"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                </HeaderIconButton>
              </>
            ) : null}
            {auth ? (
              <AccountMenu
                email={auth.email}
                profileName={auth.profile?.name ?? null}
              />
            ) : (
              <AccountMenu
                triggerRef={authTriggerRef}
                onLogin={() => openAuthModal(authTriggerRef.current)}
              />
            )}
          </nav>
        </div>

        {showCatalogSubtitle ? null : <h1 className="sr-only">Resonale</h1>}
      </header>

      {!isCatalogTab && showLiveActionTab ? (
        <div
          className="mb-4 inline-flex rounded-full border border-[#e4e2f0] bg-[#f7f6fb] p-0.5"
          role="tablist"
          aria-label="Filter by media"
        >
          {(
            [
              ["all", "All"],
              [MEDIA_TYPE.animation, "Animation"],
              [MEDIA_TYPE.liveAction, "Films"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={listMediaFilter === value}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                listMediaFilter === value
                  ? "bg-white text-[#2f3040] shadow-sm"
                  : "text-[#7a7b90]"
              }`}
              onClick={() => setListMediaFilter(value)}
              data-testid={`list-media-filter-${value}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {isCatalogTab ? (
        <div className={showCatalogSubtitle ? undefined : "mt-[18px]"}>
          {catalogLoading && !currentSlice ? (
            <ListTabSkeleton />
          ) : (
            <FilmCatalog
              films={unratedFilms}
              freshTastePicks={unratedFreshTastePicks}
              rankingMode={catalogRankingMode}
              awardWinningFilmIds={catalogAwardIds}
              pageSize={pageSize}
              loadError={catalogLoadError}
              catalogUpdatedShortLabel={catalogUpdatedShortLabel}
              mediaType={activeMedia}
              activeQuickFilter={activeQuickFilter}
              onQuickFilterChange={handleQuickFilterChange}
              showVibeSearch={
                !auth || canAccessVibeSearch(auth?.email)
              }
              vibeSearchUnlocked={canAccessVibeSearch(auth?.email)}
              onVibeSearchAuthRequired={
                auth
                  ? undefined
                  : () => openAuthModal(authTriggerRef.current)
              }
              showArchive={Boolean(auth)}
              hero={
                showCatalogSubtitle
                  ? {
                      title: catalogSubtitle.title,
                      subtitle: catalogSubtitle.primary,
                    }
                  : null
              }
              interaction={{
                profileId,
                profileSlug,
                savedFilmIds,
                filmRatings,
                ratingsReady,
                ratingOnboardingFilmIds,
                onSavedChange: handleSavedChange,
                onRatingChange: handleRatingChangeAndRefresh,
                onAuthRequired: auth ? undefined : handleAuthRequired,
              }}
            />
          )}
        </div>
      ) : (
        <>
          {activeTab === "watched" && listTabView === "list" ? (
            <section
              className="mb-8 rounded-2xl border border-gray-200 bg-white p-5"
              data-testid="taste-profile"
            >
              <p className="mb-1 text-sm font-medium text-gray-500">
                What the system knows about you
              </p>

              <h2 className="mb-3 text-xl font-semibold text-gray-900">
                Your taste profile
              </h2>

              <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-gray-700">
                {tasteProfile ??
                  "No AI taste profile yet. Generate one from your rated films."}
              </p>

              {tasteProfileUpdatedAt ? (
                <p className="mt-3 text-xs text-gray-400">
                  Last updated:{" "}
                  {new Date(tasteProfileUpdatedAt).toLocaleDateString()}
                </p>
              ) : null}

              <UpdateTasteProfileButton
                onUpdated={({
                  tasteProfile: nextTasteProfile,
                  tasteProfileUpdatedAt: nextUpdatedAt,
                }) => {
                  setTasteProfile(nextTasteProfile);
                  setTasteProfileUpdatedAt(nextUpdatedAt);
                }}
              />
            </section>
          ) : null}

          {activeTab === "watched" && listTabView === "list" ? (
            <div className="mb-3 space-y-1">
              {scoresLastComputedAtState ? (
                <p
                  className="text-xs text-slate-400"
                  data-testid="scores-last-computed-at"
                >
                  Last successful score recalculation:{" "}
                  {formatScoresLastComputedAt(scoresLastComputedAtState)}
                </p>
              ) : null}
              <p className="text-sm text-slate-500">
                Showing {listFilms.length} watched{" "}
                {listFilms.length === 1 ? "film" : "films"}
              </p>
            </div>
          ) : null}

          {listTabView === "error" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {catalogLoadError}
            </div>
          ) : null}

          {listTabView === "loading" ? <ListTabSkeleton /> : null}

          {listTabView === "empty" ? (
            <div
              data-testid="profile-tab-empty"
              className="mt-4 rounded-2xl border border-dashed p-8 text-gray-500"
            >
              {activeTab === "saved"
                ? "No saved films yet."
                : "No watched films yet."}
            </div>
          ) : null}

          {listTabView === "list" ? (
            <section
              data-testid="film-list"
              className={`grid gap-4${activeTab === "saved" ? " mt-4" : ""}`}
            >
              {listFilms.map((film, index) => (
                <FilmCard
                  key={film.id}
                  mode="catalog"
                  film={film}
                  profileId={profileId}
                  profileSlug={profileSlug}
                  initialRating={
                    typeof filmRatings[film.id] === "number"
                      ? filmRatings[film.id]
                      : null
                  }
                  savedFilmIds={savedFilmIds}
                  onSavedChange={handleSavedChange}
                  onRatingChange={handleRatingChangeAndRefresh}
                  showRatingDetail={
                    showRatingDetail && activeTab === "watched"
                  }
                  ratingDetail={ratingDetails[film.id] ?? null}
                  onRatingDetailChange={handleRatingDetailChange}
                  lazyLoadPoster={index >= 1}
                />
              ))}
            </section>
          ) : null}
        </>
      )}

      <SiteFooter catalogUpdatedLabel={catalogUpdatedLabel} />

      <EmailAuthModal
        open={modalOpen}
        onClose={handleModalClose}
        postAuthPath={catalogPostAuthPath}
        lockScrollY={modalLockScrollY}
        restoreFocusElement={modalRestoreFocusElement}
      />
    </main>
  );
}
