"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { applyPendingFilmAction } from "@/lib/apply-pending-film-action";
import {
  loadAuthenticatedProfileFilmState,
  resolveAuthenticatedProfile,
} from "@/lib/auth/resolve-auth-profile";
import type { AuthUserSummary } from "@/lib/auth/session";
import { getUserDisplayEmail } from "@/lib/auth/user-display";
import { createClient } from "@/lib/supabase/client";
import {
  clearPendingFilmActionFromSession,
  storePendingFilmActionForSession,
  type PendingFilmActionInput,
} from "@/lib/pending-film-action";
import { Film } from "@/types/film";

type CatalogTab = "all" | "saved" | "watched";

type FilmsPageClientProps = {
  auth: AuthUserSummary | null;
  films: Film[];
  awardWinningFilmIds: string[];
  pageSize: number;
  loadError: string | null;
  postAuthPath?: string;
  showSubtitle?: boolean;
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
}: FilmsPageClientProps) {
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
  const [savedFilmIds, setSavedFilmIds] = useState<Set<string>>(new Set());
  const [filmRatings, setFilmRatings] = useState<Record<string, number | null>>(
    {}
  );
  const [ratingsReady, setRatingsReady] = useState(!initialAuth);
  const preAuthSnapshotRef = useRef<InteractionSnapshot | null>(null);
  const applyInFlightRef = useRef<Promise<void> | null>(null);
  const authTriggerRef = useRef<HTMLButtonElement | null>(null);

  const syncAuthenticatedInteractionState = useCallback(async () => {
    const profile = await resolveAuthenticatedProfile();
    if (!profile) {
      setProfileId(undefined);
      setProfileSlug(undefined);
      setSavedFilmIds(new Set());
      setFilmRatings({});
      return null;
    }

    const state = await loadAuthenticatedProfileFilmState(profile.profileId);
    setProfileId(profile.profileId);
    setProfileSlug(profile.profileSlug);
    setSavedFilmIds(state.savedFilmIds);
    setFilmRatings(state.filmRatings);
    return profile.profileId;
  }, []);

  const applyPendingActionForProfile = useCallback(
    async (resolvedProfileId: string) => {
      if (applyInFlightRef.current) {
        await applyInFlightRef.current;
        return;
      }

      applyInFlightRef.current = (async () => {
        const result = await applyPendingFilmAction();

        if (result.status === "applied") {
          const appliedAction = result.action;
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
            setFilmRatings((current) => ({
              ...current,
              [appliedAction.filmId]: appliedAction.rating,
            }));
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
    []
  );

  useEffect(() => {
    setAuth(initialAuth);
    setProfileId(initialAuth?.profile?.id);
    setProfileSlug(initialAuth?.profile?.slug);
    setRatingsReady(!initialAuth);
  }, [initialAuth]);

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
        setSavedFilmIds(new Set());
        setFilmRatings({});
        setRatingsReady(true);
        return;
      }

      setRatingsReady(false);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (cancelled) {
          return;
        }

        const resolvedProfileId = await syncAuthenticatedInteractionState();
        if (resolvedProfileId) {
          await applyPendingActionForProfile(resolvedProfileId);
          if (!cancelled) {
            setRatingsReady(true);
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
        await applyPendingActionForProfile(profile.profileId);

        const state = await loadAuthenticatedProfileFilmState(profile.profileId);
        setSavedFilmIds(state.savedFilmIds);
        setFilmRatings(state.filmRatings);
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

  const handleSavedChange = useCallback((film: Film, saved: boolean) => {
    setSavedFilmIds((current) => {
      const next = new Set(current);
      if (saved) {
        next.add(film.id);
      } else {
        next.delete(film.id);
      }
      return next;
    });
  }, []);

  const handleRatingChange = useCallback(
    (filmId: string, rating: number | null) => {
      setFilmRatings((current) => ({
        ...current,
        [filmId]: rating,
      }));
    },
    []
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

    setSavedFilmIds(snapshot.savedFilmIds);
    setFilmRatings(snapshot.filmRatings);
    preAuthSnapshotRef.current = null;
  }, []);

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

  const listFilms = activeTab === "saved" ? savedFilms : watchedFilms;
  const showCatalogSubtitle = showSubtitle && activeTab === "all";

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl p-8">
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
              Find strange, beautiful and emotionally resonant animated films to
              watch next.
            </p>
            <p className="mt-1 font-sans text-[14px] font-normal leading-[1.3] tracking-tight text-[#7a7b90] antialiased [font-synthesis:none] sm:whitespace-nowrap">
              Independent, artist-led and festival animation from around the
              world.
            </p>
          </div>
        ) : (
          <h1 className="sr-only">Resonale</h1>
        )}
      </header>

      {activeTab === "all" ? (
        <div className={showCatalogSubtitle ? undefined : "mt-[18px]"}>
          <FilmCatalog
            films={films}
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
          {activeTab === "watched" && listFilms.length > 0 ? (
            <p className="mb-3 mt-4 text-sm text-slate-500">
              Showing {listFilms.length} watched{" "}
              {listFilms.length === 1 ? "film" : "films"}
            </p>
          ) : null}

          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {loadError}
            </div>
          ) : null}

          {!loadError && listFilms.length === 0 ? (
            <div
              data-testid="profile-tab-empty"
              className="mt-4 rounded-2xl border border-dashed p-8 text-gray-500"
            >
              {activeTab === "saved"
                ? "No saved films yet."
                : "No watched films yet."}
            </div>
          ) : null}

          {!loadError && listFilms.length > 0 ? (
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
                  lazyLoadPoster={index >= 3}
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
