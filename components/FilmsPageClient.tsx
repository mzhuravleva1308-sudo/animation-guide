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
} from "@/components/HeaderIconControl";
import ResonaleBrand from "@/components/ResonaleBrand";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";
import { applyPendingFilmAction } from "@/lib/apply-pending-film-action";
import {
  loadAuthenticatedProfileFilmState,
  resolveAuthenticatedProfile,
} from "@/lib/auth/resolve-auth-profile";
import type { AuthUserSummary } from "@/lib/auth/session";
import { getUserDisplayEmail } from "@/lib/auth/user-display";
import {
  MEDIA_TYPE,
  normalizeMediaType,
  type MediaType,
} from "@/lib/media-type";
import { createClient } from "@/lib/supabase/client";
import {
  clearPendingFilmActionFromSession,
  storePendingFilmActionForSession,
  type PendingFilmActionInput,
} from "@/lib/pending-film-action";
import { resolveProfileListTabView } from "@/lib/profile-list-tab-view.mjs";
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
  /** Newest successful profile↔film score write time (ISO). */
  scoresLastComputedAt?: string | null;
  /** Active catalog media (animation default). */
  mediaType?: "animation" | "live_action";
  /** Legacy query value; catalog always ranks native for the active media. */
  sortParam?:
    | "native"
    | "cross_from_animation"
    | "cross_from_live_action";
  /** Early-access retired: Films tab is always shown. */
  showLiveActionTab?: boolean;
};

type InteractionSnapshot = {
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number | null>;
};

function cloneInteractionSnapshot(
  savedFilmIds: Set<string>,
  filmRatings: Record<string, number | null>
): InteractionSnapshot {
  return {
    savedFilmIds: new Set(savedFilmIds),
    filmRatings: { ...filmRatings },
  };
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
  scoresLastComputedAt = null,
  mediaType: initialMediaType = MEDIA_TYPE.animation,
  sortParam: _unusedSortParam = "native",
  showLiveActionTab = false,
}: FilmsPageClientProps) {
  const [auth, setAuth] = useState(initialAuth);
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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLockScrollY, setModalLockScrollY] = useState(0);
  const [modalRestoreFocusElement, setModalRestoreFocusElement] =
    useState<HTMLElement | null>(null);
  const [profileId, setProfileId] = useState<string | undefined>(
    initialAuth?.profile?.id
  );
  const [profileSlug, setProfileSlug] = useState<string | undefined>(
    initialAuth?.profile?.slug
  );
  const [tasteProfile, setTasteProfile] = useState<string | null>(null);
  const [tasteProfileUpdatedAt, setTasteProfileUpdatedAt] = useState<
    string | null
  >(null);
  const [savedFilmIds, setSavedFilmIds] = useState<Set<string>>(
    () => new Set(initialSavedFilmIds)
  );
  const [filmRatings, setFilmRatings] = useState<Record<string, number | null>>(
    () => ({ ...initialFilmRatings })
  );
  // SSR always hydrates list state (possibly empty). Avoid a loading flash on `/`
  // after auth redirect; only gate UI when auth appears client-side without SSR lists.
  const [ratingsReady, setRatingsReady] = useState(true);
  const listsHydratedFromSsrRef = useRef(initialAuth !== null);
  const preAuthSnapshotRef = useRef<InteractionSnapshot | null>(null);
  const applyInFlightRef = useRef<Promise<void> | null>(null);
  const authTriggerRef = useRef<HTMLButtonElement | null>(null);
  /** Bumped on local save/rating edits so in-flight server sync cannot clobber them. */
  const interactionGenerationRef = useRef(0);

  const bumpInteractionGeneration = useCallback(() => {
    interactionGenerationRef.current += 1;
  }, []);

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

  const applyServerFilmRatings = useCallback(
    (serverRatings: Record<string, number | null>) => {
      // Always prefer in-memory edits (including explicit null unrates) over a
      // stale fetch that started before the latest optimistic change landed.
      setFilmRatings((current) => ({ ...serverRatings, ...current }));
    },
    []
  );

  const syncAuthenticatedInteractionState = useCallback(async () => {
    const profile = await resolveAuthenticatedProfile();
    if (!profile) {
      setProfileId(undefined);
      setProfileSlug(undefined);
      setTasteProfile(null);
      setTasteProfileUpdatedAt(null);
      setSavedFilmIds(new Set());
      setFilmRatings({});
      return null;
    }

    const generationAtStart = interactionGenerationRef.current;
    const state = await loadAuthenticatedProfileFilmState(profile.profileId);
    setProfileId(profile.profileId);
    setProfileSlug(profile.profileSlug);
    setTasteProfile(profile.tasteProfile);
    setTasteProfileUpdatedAt(profile.tasteProfileUpdatedAt);
    if (generationAtStart === interactionGenerationRef.current) {
      setSavedFilmIds(state.savedFilmIds);
    }
    applyServerFilmRatings(state.filmRatings);
    return profile.profileId;
  }, [applyServerFilmRatings]);

  const applyPendingActionForProfile = useCallback(
    async (_resolvedProfileId: string) => {
      if (applyInFlightRef.current) {
        await applyInFlightRef.current;
        return;
      }

      applyInFlightRef.current = (async () => {
        const result = await applyPendingFilmAction();

        if (result.status === "applied") {
          const appliedAction = result.action;
          bumpInteractionGeneration();
          if (appliedAction.type === "save") {
            setSavedFilmIds((current) => {
              const next = new Set(current);
              if (appliedAction.saved) {
                next.add(appliedAction.filmId);
              } else {
                next.delete(appliedAction.filmId);
              }
              return next;
            });
          } else {
            setFilmRatings((current) => {
              const next = { ...current };
              next[appliedAction.filmId] = appliedAction.rating;
              return next;
            });
          }
        } else if (result.status === "error") {
          console.error("Failed to apply pending film action:", result.message);
        }
      })();

      try {
        await applyInFlightRef.current;
      } finally {
        applyInFlightRef.current = null;
      }
    },
    [bumpInteractionGeneration]
  );

  useEffect(() => {
    setAuth(initialAuth);
    setProfileId(initialAuth?.profile?.id);
    setProfileSlug(initialAuth?.profile?.slug);
    setFilmRatings({ ...initialFilmRatings });
    setSavedFilmIds(new Set(initialSavedFilmIds));
    setRatingsReady(true);
    listsHydratedFromSsrRef.current = initialAuth !== null;
    const key = catalogSliceKey(initialMediaType);
    setCatalogSlices((current) => ({
      ...current,
      [key]: {
        films,
        awardWinningFilmIds,
        loadError,
      },
    }));
  }, [
    initialAuth,
    initialFilmRatings,
    initialSavedFilmIds,
    initialMediaType,
    films,
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

  useEffect(() => {
    let cancelled = false;

    async function initializeAuthenticatedState() {
      if (!auth) {
        setProfileId(undefined);
        setProfileSlug(undefined);
        setTasteProfile(null);
        setTasteProfileUpdatedAt(null);
        setSavedFilmIds(new Set());
        setFilmRatings({});
        setRatingsReady(true);
        listsHydratedFromSsrRef.current = false;
        return;
      }

      // Client-only auth (modal / session establish) has no SSR list payload yet.
      if (!listsHydratedFromSsrRef.current) {
        setRatingsReady(false);
      }

      const initStartedAt = performance.now();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (cancelled) {
          return;
        }

        const resolvedProfileId = await syncAuthenticatedInteractionState();
        if (resolvedProfileId) {
          await applyPendingActionForProfile(resolvedProfileId);
          if (!cancelled) {
            const fromSsr = listsHydratedFromSsrRef.current;
            setRatingsReady(true);
            listsHydratedFromSsrRef.current = true;
            if (process.env.NODE_ENV === "development") {
              console.info("[catalog] client lists ready", {
                ms: Math.round(performance.now() - initStartedAt),
                fromSsr,
              });
            }
          }
          return;
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 300);
        });
      }

      if (!cancelled) {
        setRatingsReady(true);
      }
    }

    void initializeAuthenticatedState();

    return () => {
      cancelled = true;
    };
  }, [auth, applyPendingActionForProfile, syncAuthenticatedInteractionState]);

  useEffect(() => {
    const supabase = createClient();

    async function handleAuthSessionEstablished() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      preAuthSnapshotRef.current = null;

      const profile = await resolveAuthenticatedProfile();
      if (profile) {
        setProfileId(profile.profileId);
        setProfileSlug(profile.profileSlug);
        setTasteProfile(profile.tasteProfile);
        setTasteProfileUpdatedAt(profile.tasteProfileUpdatedAt);
        await applyPendingActionForProfile(profile.profileId);

        const generationAtStart = interactionGenerationRef.current;
        const state = await loadAuthenticatedProfileFilmState(profile.profileId);
        if (generationAtStart === interactionGenerationRef.current) {
          setSavedFilmIds(state.savedFilmIds);
        }
        applyServerFilmRatings(state.filmRatings);
        setRatingsReady(true);
      }

      setAuth({
        email: getUserDisplayEmail(user),
        profile: profile
          ? {
              id: profile.profileId,
              slug: profile.profileSlug,
              name: profile.profileName ?? profile.profileSlug,
            }
          : null,
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void handleAuthSessionEstablished();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [applyPendingActionForProfile]);

  const handleSavedChange = useCallback(
    (film: Film, saved: boolean) => {
      bumpInteractionGeneration();
      setSavedFilmIds((current) => {
        const next = new Set(current);
        if (saved) {
          next.add(film.id);
        } else {
          next.delete(film.id);
        }
        return next;
      });
    },
    [bumpInteractionGeneration]
  );

  const handleRatingChange = useCallback(
    (filmId: string, rating: number | null) => {
      bumpInteractionGeneration();
      setFilmRatings((current) => ({
        ...current,
        // Keep explicit null so a stale server fetch cannot revive an unrate.
        [filmId]: rating,
      }));
    },
    [bumpInteractionGeneration]
  );

  const openAuthModal = useCallback((restoreFocus: HTMLElement | null = null) => {
    setModalLockScrollY(window.scrollY);
    setModalRestoreFocusElement(restoreFocus);
    setModalOpen(true);
  }, []);

  const handleAuthRequired = useCallback(
    (action: PendingFilmActionInput) => {
      setModalLockScrollY(window.scrollY);
      setModalRestoreFocusElement(null);

      if (!preAuthSnapshotRef.current) {
        preAuthSnapshotRef.current = cloneInteractionSnapshot(
          savedFilmIds,
          filmRatings
        );
      }

      storePendingFilmActionForSession(action);
      setModalOpen(true);
    },
    [filmRatings, savedFilmIds]
  );

  const revertPreAuthSnapshot = useCallback(() => {
    const snapshot = preAuthSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    bumpInteractionGeneration();
    setSavedFilmIds(snapshot.savedFilmIds);
    setFilmRatings(snapshot.filmRatings);
    preAuthSnapshotRef.current = null;
  }, [bumpInteractionGeneration]);

  const handleModalClose = useCallback(() => {
    clearPendingFilmActionFromSession();
    revertPreAuthSnapshot();
    setModalOpen(false);
  }, [revertPreAuthSnapshot]);

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
    if (listMediaFilter === "all") {
      return saved;
    }
    return saved.filter((film) => filmMediaType(film) === listMediaFilter);
  }, [libraryFilms, listMediaFilter, savedFilmIds]);

  const watchedFilms = useMemo(() => {
    const watched = libraryFilms.filter((film) => {
      const rating = filmRatings[film.id];
      return typeof rating === "number";
    });
    if (listMediaFilter === "all") {
      return watched;
    }
    return watched.filter((film) => filmMediaType(film) === listMediaFilter);
  }, [filmRatings, libraryFilms, listMediaFilter]);

  // All/Films queues: rated films leave immediately via optimistic
  // filmRatings updates (no reload), and return when the rating is cleared.
  const unratedFilms = useMemo(
    () =>
      catalogFilms.filter((film) => typeof filmRatings[film.id] !== "number"),
    [catalogFilms, filmRatings]
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

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl p-8"
      data-testid="films-page"
      data-ratings-ready={ratingsReady ? "true" : "false"}
    >
      <header className={isCatalogTab ? "mb-0" : "mb-[18px]"}>
        <div className="flex flex-nowrap items-center justify-between gap-2 sm:gap-3">
          <ResonaleBrand onClick={() => handleTabChange("all")} />

          <nav
            aria-label="Catalog and lists"
            className="flex shrink-0 items-center gap-0.5 sm:gap-2 md:gap-3"
          >
            <HeaderIconButton
              label="Animation"
              active={activeTab === "all"}
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
                labelClassName="hidden sm:inline-block"
                iconActiveClassName="after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-2px] after:h-px after:bg-[rgba(177,169,217,0.35)] after:content-[''] sm:after:hidden"
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
            <HeaderIconButton
              label="Saved"
              active={activeTab === "saved"}
              labelClassName="hidden lg:inline-block"
              iconActiveClassName="after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-2px] after:h-px after:bg-[rgba(177,169,217,0.35)] after:content-[''] lg:after:hidden"
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
              labelClassName="hidden md:inline-block"
              iconActiveClassName="after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-2px] after:h-px after:bg-[rgba(177,169,217,0.35)] after:content-[''] md:after:hidden"
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
