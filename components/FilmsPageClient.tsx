"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AccountMenu from "@/components/AccountMenu";
import EmailAuthModal from "@/components/EmailAuthModal";
import FilmCatalog from "@/components/FilmCatalog";
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

type FilmsPageClientProps = {
  auth: AuthUserSummary | null;
  films: Film[];
  awardWinningFilmIds: string[];
  pageSize: number;
  loadError: string | null;
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
}: FilmsPageClientProps) {
  const [auth, setAuth] = useState(initialAuth);
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
        const result = await applyPendingFilmAction({
          profileId: resolvedProfileId,
        });

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
  }, [initialAuth]);

  useEffect(() => {
    let cancelled = false;

    async function initializeAuthenticatedState() {
      if (!auth) {
        setProfileId(undefined);
        setProfileSlug(undefined);
        setSavedFilmIds(new Set());
        setFilmRatings({});
        return;
      }

      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (cancelled) {
          return;
        }

        const resolvedProfileId = await syncAuthenticatedInteractionState();
        if (resolvedProfileId) {
          await applyPendingActionForProfile(resolvedProfileId);
          return;
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 300);
        });
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

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl p-8">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold">Animation Guide</h1>
            <p className="mt-2 text-gray-600">
              Find strange, beautiful, and emotionally resonant animated films to
              watch next.
            </p>
          </div>

          {auth ? (
            <AccountMenu
              email={auth.email}
              profileName={auth.profile?.name ?? null}
            />
          ) : (
            <button
              ref={authTriggerRef}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                setModalLockScrollY(window.scrollY);
                setModalRestoreFocusElement(authTriggerRef.current);
                setModalOpen(true);
              }}
              className="shrink-0 text-sm text-gray-500 transition hover:text-gray-900"
              data-testid="auth-status"
            >
              Log in
            </button>
          )}
        </div>
      </header>

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
          onSavedChange: handleSavedChange,
          onRatingChange: handleRatingChange,
          onAuthRequired: auth ? undefined : handleAuthRequired,
        }}
      />

      <EmailAuthModal
        open={modalOpen}
        onClose={handleModalClose}
        postAuthPath="/films"
        lockScrollY={modalLockScrollY}
        restoreFocusElement={modalRestoreFocusElement}
      />
    </main>
  );
}
