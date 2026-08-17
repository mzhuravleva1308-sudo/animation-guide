"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  CircleCheck,
  Clapperboard,
  Film as FilmIcon,
  UserRound,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import EmailAuthModal from "@/components/EmailAuthModal";
import FilmCard from "@/components/FilmCard";
import FilmCatalog from "@/components/FilmCatalog";
import {
  HeaderIconButton,
  HEADER_LOGIN_ICON,
  HEADER_NAV_ICON,
  headerNavLabelCollapse,
} from "@/components/HeaderIconControl";
import ResonaleBrand from "@/components/ResonaleBrand";
import SiteFooter from "@/components/SiteFooter";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";
import type { AuthUserSummary } from "@/lib/auth/session";
import {
  MEDIA_TYPE,
  normalizeMediaType,
  type MediaType,
} from "@/lib/media-type";
import { resolveProfileListTabView } from "@/lib/profile-list-tab-view.mjs";
import { useCatalogFilmInteraction } from "@/lib/use-catalog-film-interaction";
import { Film } from "@/types/film";

type CatalogSlice = {
  films: Film[];
  awardWinningFilmIds: string[];
  loadError: string | null;
};

type ListMediaFilter = "all" | MediaType;

function catalogSliceKey(media: MediaType): string {
  return `${media}|native`;
}

function syncCatalogUrl(media: MediaType) {
  if (typeof window === "undefined") {
    return;
  }
  const params = new URLSearchParams();
  if (media !== MEDIA_TYPE.animation) {
    params.set("media", media);
  }
  const query = params.toString();
  const next = query ? `/?${query}` : "/";
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.replaceState(window.history.state, "", next);
  }
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
  awardWinningFilmIds: string[];
  pageSize: number;
  loadError: string | null;
  postAuthPath?: string;
  showSubtitle?: boolean;
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
  /** Active catalog media (animation default). */
  mediaType?: "animation" | "live_action";
  /** Legacy query value; catalog always ranks native for the active media. */
  sortParam?:
    | "native"
    | "cross_from_animation"
    | "cross_from_live_action";
  /** Films catalog tab is always public (guests + signed-in). */
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
  awardWinningFilmIds,
  pageSize,
  loadError,
  postAuthPath = "/",
  showSubtitle = false,
  initialFilmRatings = {},
  initialSavedFilmIds = [],
  initialRatingUpdatedAtMs = {},
  initialSavedAtMs = {},
  scoresLastComputedAt = null,
  mediaType: initialMediaType = MEDIA_TYPE.animation,
  sortParam: _unusedSortParam = "native",
  showLiveActionTab = true,
}: FilmsPageClientProps) {
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
    postAuthPath,
  });
  const [scoresLastComputedAtState, setScoresLastComputedAtState] = useState<
    string | null
  >(scoresLastComputedAt);
  const [activeTab, setActiveTab] = useState<CatalogTab>(() =>
    initialMediaType === MEDIA_TYPE.liveAction ? "films" : "all"
  );
  const [activeMedia, setActiveMedia] = useState<MediaType>(initialMediaType);
  const [listMediaFilter, setListMediaFilter] =
    useState<ListMediaFilter>("all");
  const [catalogSlices, setCatalogSlices] = useState<
    Record<string, CatalogSlice>
  >(() => ({
    [catalogSliceKey(initialMediaType)]: {
      films,
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

  const ensureCatalog = useCallback(async (media: MediaType) => {
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
      try {
        const params = new URLSearchParams();
        if (media !== MEDIA_TYPE.animation) {
          params.set("media", media);
        }
        const query = params.toString();
        const response = await fetch(
          query ? `/api/catalog?${query}` : "/api/catalog"
        );
        if (!response.ok) {
          console.error("[catalog] client fetch failed", response.status);
          return null;
        }
        const payload = (await response.json()) as {
          films?: Film[];
          awardWinningFilmIds?: string[];
          loadError?: string | null;
        };
        const slice: CatalogSlice = {
          films: payload.films ?? [],
          awardWinningFilmIds: payload.awardWinningFilmIds ?? [],
          loadError: payload.loadError ?? null,
        };
        setCatalogSlices((current) =>
          current[key] ? current : { ...current, [key]: slice }
        );
        return slice;
      } catch (error) {
        console.error("[catalog] client fetch error", error);
        return null;
      } finally {
        catalogInflightRef.current.delete(key);
      }
    })();

    catalogInflightRef.current.set(key, request);
    return request;
  }, []);

  const selectCatalog = useCallback(
    async (media: MediaType) => {
      const key = catalogSliceKey(media);
      if (!catalogSlicesRef.current[key]) {
        setCatalogLoading(true);
        await ensureCatalog(media);
        setCatalogLoading(false);
      }
      setActiveMedia(media);
      setActiveTab(media === MEDIA_TYPE.liveAction ? "films" : "all");
      syncCatalogUrl(media);
    },
    [ensureCatalog]
  );

  useEffect(() => {
    const key = catalogSliceKey(initialMediaType);
    setCatalogSlices((current) => ({
      ...current,
      [key]: {
        films,
        awardWinningFilmIds,
        loadError,
      },
    }));
  }, [initialMediaType, films, awardWinningFilmIds, loadError]);

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

  const refreshScoresLastComputedAt = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeMedia !== MEDIA_TYPE.animation) {
        params.set("media", activeMedia);
      }
      const query = params.toString();
      const response = await fetch(
        query ? `/api/catalog?${query}` : "/api/catalog"
      );
      if (!response.ok) return;
      const payload = (await response.json()) as {
        scoresLastComputedAt?: string | null;
      };
      if (typeof payload.scoresLastComputedAt === "string") {
        setScoresLastComputedAtState(payload.scoresLastComputedAt);
      } else if (payload.scoresLastComputedAt === null) {
        setScoresLastComputedAtState(null);
      }
    } catch (error) {
      console.error("[catalog] scores timestamp refresh failed", error);
    }
  }, [activeMedia]);

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
        void selectCatalog(MEDIA_TYPE.liveAction);
        return;
      }

      setActiveTab(tab);
      if (tab === "watched") {
        void refreshScoresLastComputedAt();
      }
    },
    [auth, openAuthModal, refreshScoresLastComputedAt, selectCatalog]
  );

  const isCatalogTab = activeTab === "all" || activeTab === "films";
  const catalogSubtitle =
    activeMedia === MEDIA_TYPE.liveAction
      ? {
          primary:
            "Find distinctive, beautiful and emotionally resonant films to watch next.",
          secondary:
            "Films with a world and pulse of their own, from independent voices and celebrated auteurs.",
        }
      : {
          primary:
            "Find strange, beautiful and emotionally resonant animated films to watch next.",
          secondary:
            "Independent, artist-led and festival animation from around the world.",
        };

  const currentSlice = catalogSlices[catalogSliceKey(activeMedia)] ?? null;
  const catalogFilms = currentSlice?.films ?? [];
  const catalogAwardIds = currentSlice?.awardWinningFilmIds ?? [];
  const catalogLoadError = currentSlice?.loadError ?? loadError;

  const libraryFilms = useMemo(() => {
    const byId = new Map<string, Film>();
    for (const slice of Object.values(catalogSlices)) {
      for (const film of slice.films) {
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

  const ratingOnboardingFilmIds = useMemo(
    () => catalogFilms.map((film) => film.id),
    [catalogFilms]
  );

  const listFilms = activeTab === "saved" ? savedFilms : watchedFilms;
  // ratingsReady covers both filmRatings and savedFilmIds — they load together
  // in loadAuthenticatedProfileFilmState, then pending actions apply before ready.
  const listTabView = resolveProfileListTabView({
    loadError: catalogLoadError,
    listsReady: ratingsReady,
    listLength: listFilms.length,
  });
  const showCatalogSubtitle = showSubtitle && isCatalogTab;
  const animationNav = headerNavLabelCollapse(activeTab === "all", "sm");
  const filmsNav = headerNavLabelCollapse(activeTab === "films", "sm");
  const savedNav = headerNavLabelCollapse(activeTab === "saved", "lg");
  const watchedNav = headerNavLabelCollapse(activeTab === "watched", "md");

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      data-testid="films-page"
      data-ratings-ready={ratingsReady ? "true" : "false"}
    >
      <header className={isCatalogTab ? "mb-0" : "mb-[18px]"}>
        <div className="flex flex-nowrap items-center justify-between gap-1 sm:gap-3">
          <ResonaleBrand onClick={() => handleTabChange("all")} />

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
              <HeaderIconButton
                label="Log in"
                showLabel={false}
                buttonRef={authTriggerRef}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => openAuthModal(authTriggerRef.current)}
                data-testid="auth-status"
              >
                <UserRound
                  size={HEADER_LOGIN_ICON.size}
                  strokeWidth={HEADER_LOGIN_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconButton>
            )}
          </nav>
        </div>

        {showCatalogSubtitle ? (
          <div className="mt-[18px] mb-[22px]">
            <h1 className="sr-only">Resonale</h1>
            <p className="font-sans text-[16px] font-normal leading-[1.3] tracking-tight text-[#4a4b5c] antialiased [font-synthesis:none] sm:whitespace-nowrap">
              {catalogSubtitle.primary}
            </p>
            <p className="mt-1 font-sans text-[14px] font-normal leading-[1.3] tracking-tight text-[#7a7b90] antialiased [font-synthesis:none] sm:whitespace-nowrap">
              {catalogSubtitle.secondary}
            </p>
          </div>
        ) : (
          <h1 className="sr-only">Resonale</h1>
        )}
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
              awardWinningFilmIds={catalogAwardIds}
              pageSize={pageSize}
              loadError={catalogLoadError}
              mediaType={activeMedia}
              interaction={{
                profileId,
                profileSlug,
                savedFilmIds,
                filmRatings,
                ratingsReady,
                ratingOnboardingFilmIds,
                onSavedChange: handleSavedChange,
                onRatingChange: handleRatingChange,
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
                  onRatingChange={handleRatingChange}
                  lazyLoadPoster={index >= 1}
                />
              ))}
            </section>
          ) : null}
        </>
      )}

      <SiteFooter />

      <EmailAuthModal
        open={modalOpen}
        onClose={handleModalClose}
        postAuthPath={postAuthPath}
        lockScrollY={modalLockScrollY}
        restoreFocusElement={modalRestoreFocusElement}
      />
    </main>
  );
}
