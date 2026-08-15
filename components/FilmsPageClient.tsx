"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, CircleCheck, Film as FilmIcon, UserRound } from "lucide-react";
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
  crossMediaSortLabel,
  oppositeMediaType,
} from "@/lib/media-type";
import { createClient } from "@/lib/supabase/client";
import {
  clearPendingFilmActionFromSession,
  storePendingFilmActionForSession,
  type PendingFilmActionInput,
} from "@/lib/pending-film-action";
import { resolveProfileListTabView } from "@/lib/profile-list-tab-view.mjs";
import { Film } from "@/types/film";

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

type CatalogTab = "all" | "saved" | "watched";

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
  /** Active catalog media (animation default). */
  mediaType?: "animation" | "live_action";
  /** Ranking mode query value. */
  sortParam?: "native" | "cross_from_animation" | "cross_from_live_action";
  /** Early-access Films tab (allowlisted emails only). */
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
  mediaType = MEDIA_TYPE.animation,
  sortParam = "native",
  showLiveActionTab = false,
}: FilmsPageClientProps) {
  const router = useRouter();
  const [auth, setAuth] = useState(initialAuth);
  const [activeTab, setActiveTab] = useState<CatalogTab>("all");
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
  }, [initialAuth, initialFilmRatings, initialSavedFilmIds]);

  useEffect(() => {
    if (!auth && activeTab !== "all") {
      setActiveTab("all");
    }
  }, [auth, activeTab]);

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

  const handleTabChange = useCallback(
    (tab: CatalogTab) => {
      if ((tab === "saved" || tab === "watched") && !auth) {
        openAuthModal(authTriggerRef.current);
        return;
      }

      setActiveTab(tab);
    },
    [auth, openAuthModal]
  );

  const navigateCatalogRanking = useCallback(
    (next: { media?: string; sort?: string }) => {
      const params = new URLSearchParams();
      const nextMedia = next.media ?? mediaType;
      const nextSort = next.sort ?? sortParam;
      if (nextMedia !== MEDIA_TYPE.animation) {
        params.set("media", nextMedia);
      }
      if (nextSort !== "native") {
        params.set("sort", nextSort);
      }
      const query = params.toString();
      router.push(query ? `/?${query}` : "/");
    },
    [mediaType, router, sortParam]
  );

  const crossSourceMedia = oppositeMediaType(mediaType);
  const crossSortParam =
    crossSourceMedia === MEDIA_TYPE.animation
      ? "cross_from_animation"
      : "cross_from_live_action";
  const isCrossSort = sortParam !== "native";
  const catalogSubtitle =
    mediaType === MEDIA_TYPE.liveAction
      ? {
          primary:
            "Find quiet, strange and emotionally resonant films to watch next.",
          secondary:
            "Early access live-action catalog — scored separately from animation.",
        }
      : {
          primary:
            "Find strange, beautiful and emotionally resonant animated films to watch next.",
          secondary:
            "Independent, artist-led and festival animation from around the world.",
        };

  const savedFilms = useMemo(
    () => films.filter((film) => savedFilmIds.has(film.id)),
    [films, savedFilmIds]
  );

  const watchedFilms = useMemo(
    () =>
      films.filter((film) => {
        const rating = filmRatings[film.id];
        return typeof rating === "number";
      }),
    [films, filmRatings]
  );

  // All is the unrated queue: rated films leave immediately via optimistic
  // filmRatings updates (no reload), and return when the rating is cleared.
  const unratedFilms = useMemo(
    () =>
      films.filter((film) => typeof filmRatings[film.id] !== "number"),
    [films, filmRatings]
  );

  const listFilms = activeTab === "saved" ? savedFilms : watchedFilms;
  // ratingsReady covers both filmRatings and savedFilmIds — they load together
  // in loadAuthenticatedProfileFilmState, then pending actions apply before ready.
  const listTabView = resolveProfileListTabView({
    loadError,
    listsReady: ratingsReady,
    listLength: listFilms.length,
  });
  const showCatalogSubtitle = showSubtitle && activeTab === "all";

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl p-8"
      data-testid="films-page"
      data-ratings-ready={ratingsReady ? "true" : "false"}
    >
      <header className={activeTab === "all" ? "mb-0" : "mb-[18px]"}>
        <div className="flex flex-nowrap items-center justify-between gap-2 sm:gap-3">
          <ResonaleBrand onClick={() => handleTabChange("all")} />

          <nav
            aria-label="Catalog and lists"
            className="flex shrink-0 items-center gap-0.5 sm:gap-2 md:gap-3"
          >
            <HeaderIconButton
              label="All"
              active={activeTab === "all"}
              onClick={() => handleTabChange("all")}
            >
              <FilmIcon
                size={HEADER_NAV_ICON.size}
                strokeWidth={HEADER_NAV_ICON.strokeWidth}
                fill="none"
                className="shrink-0"
                aria-hidden="true"
              />
            </HeaderIconButton>
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
            {showLiveActionTab ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex rounded-full border border-[#e4e2f0] bg-[#f7f6fb] p-0.5"
                  role="tablist"
                  aria-label="Catalog media"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mediaType === MEDIA_TYPE.animation}
                    className={`rounded-full px-3 py-1.5 text-sm transition ${
                      mediaType === MEDIA_TYPE.animation
                        ? "bg-white text-[#2f3040] shadow-sm"
                        : "text-[#7a7b90]"
                    }`}
                    onClick={() =>
                      navigateCatalogRanking({
                        media: MEDIA_TYPE.animation,
                        sort: "native",
                      })
                    }
                    data-testid="catalog-media-animation"
                  >
                    Animation
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mediaType === MEDIA_TYPE.liveAction}
                    className={`rounded-full px-3 py-1.5 text-sm transition ${
                      mediaType === MEDIA_TYPE.liveAction
                        ? "bg-white text-[#2f3040] shadow-sm"
                        : "text-[#7a7b90]"
                    }`}
                    onClick={() =>
                      navigateCatalogRanking({
                        media: MEDIA_TYPE.liveAction,
                        sort: "native",
                      })
                    }
                    data-testid="catalog-media-live-action"
                  >
                    Films
                  </button>
                </div>
                <div
                  className="inline-flex flex-wrap gap-2"
                  aria-label="Ranking mode"
                >
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      !isCrossSort
                        ? "border-[#cfc8e8] bg-white text-[#2f3040]"
                        : "border-transparent text-[#7a7b90]"
                    }`}
                    onClick={() =>
                      navigateCatalogRanking({ media: mediaType, sort: "native" })
                    }
                    data-testid="catalog-sort-native"
                  >
                    Your {mediaType === MEDIA_TYPE.liveAction ? "film" : "animation"}{" "}
                    taste
                  </button>
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      isCrossSort
                        ? "border-[#cfc8e8] bg-white text-[#2f3040]"
                        : "border-transparent text-[#7a7b90]"
                    }`}
                    onClick={() =>
                      navigateCatalogRanking({
                        media: mediaType,
                        sort: crossSortParam,
                      })
                    }
                    data-testid="catalog-sort-cross"
                  >
                    {crossMediaSortLabel(crossSourceMedia)}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <h1 className="sr-only">Resonale</h1>
        )}
      </header>

      {activeTab === "all" ? (
        <div className={showCatalogSubtitle ? undefined : "mt-[18px]"}>
          <FilmCatalog
            films={unratedFilms}
            awardWinningFilmIds={awardWinningFilmIds}
            pageSize={pageSize}
            loadError={loadError}
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
            <p className="mb-3 text-sm text-slate-500">
              Showing {listFilms.length} watched{" "}
              {listFilms.length === 1 ? "film" : "films"}
            </p>
          ) : null}

          {listTabView === "error" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {loadError}
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
