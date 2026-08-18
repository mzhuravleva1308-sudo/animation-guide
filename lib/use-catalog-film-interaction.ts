"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type InteractionSnapshot = {
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number | null>;
  ratingUpdatedAtMs: Record<string, number>;
  savedAtMs: Record<string, number>;
};

function cloneInteractionSnapshot(
  savedFilmIds: Set<string>,
  filmRatings: Record<string, number | null>,
  ratingUpdatedAtMs: Record<string, number>,
  savedAtMs: Record<string, number>
): InteractionSnapshot {
  return {
    savedFilmIds: new Set(savedFilmIds),
    filmRatings: { ...filmRatings },
    ratingUpdatedAtMs: { ...ratingUpdatedAtMs },
    savedAtMs: { ...savedAtMs },
  };
}

type UseCatalogFilmInteractionArgs = {
  initialAuth: AuthUserSummary | null;
  initialFilmRatings?: Record<string, number>;
  initialSavedFilmIds?: string[];
  initialRatingUpdatedAtMs?: Record<string, number>;
  initialSavedAtMs?: Record<string, number>;
  postAuthPath?: string;
};

// Module-level so omitted args stay referentially stable across renders.
const EMPTY_FILM_RATINGS: Record<string, number> = {};
const EMPTY_SAVED_FILM_IDS: string[] = [];
const EMPTY_TIMESTAMP_MAP: Record<string, number> = {};

export function useCatalogFilmInteraction({
  initialAuth,
  initialFilmRatings = EMPTY_FILM_RATINGS,
  initialSavedFilmIds = EMPTY_SAVED_FILM_IDS,
  initialRatingUpdatedAtMs = EMPTY_TIMESTAMP_MAP,
  initialSavedAtMs = EMPTY_TIMESTAMP_MAP,
  postAuthPath = "/",
}: UseCatalogFilmInteractionArgs) {
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
  const [ratingUpdatedAtMs, setRatingUpdatedAtMs] = useState<
    Record<string, number>
  >(() => ({ ...initialRatingUpdatedAtMs }));
  const [savedAtMs, setSavedAtMs] = useState<Record<string, number>>(
    () => ({ ...initialSavedAtMs })
  );
  const [ratingsReady, setRatingsReady] = useState(true);
  const listsHydratedFromSsrRef = useRef(initialAuth !== null);
  const preAuthSnapshotRef = useRef<InteractionSnapshot | null>(null);
  const applyInFlightRef = useRef<Promise<void> | null>(null);
  const authTriggerRef = useRef<HTMLButtonElement | null>(null);
  const interactionGenerationRef = useRef(0);

  const bumpInteractionGeneration = useCallback(() => {
    interactionGenerationRef.current += 1;
  }, []);

  const applyServerFilmRatings = useCallback(
    (serverRatings: Record<string, number | null>) => {
      setFilmRatings((current) => ({ ...serverRatings, ...current }));
    },
    []
  );

  const applyServerListTimestamps = useCallback(
    (
      serverRatingUpdatedAtMs: Record<string, number>,
      serverSavedAtMs?: Record<string, number>
    ) => {
      setRatingUpdatedAtMs((current) => ({
        ...serverRatingUpdatedAtMs,
        ...current,
      }));
      if (serverSavedAtMs) {
        setSavedAtMs((current) => ({ ...serverSavedAtMs, ...current }));
      }
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
      setRatingUpdatedAtMs({});
      setSavedAtMs({});
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
      applyServerListTimestamps(state.ratingUpdatedAtMs, state.savedAtMs);
    } else {
      applyServerListTimestamps(state.ratingUpdatedAtMs);
    }
    applyServerFilmRatings(state.filmRatings);
    return profile.profileId;
  }, [applyServerFilmRatings, applyServerListTimestamps]);

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
            setSavedAtMs((current) => {
              const next = { ...current };
              if (appliedAction.saved) {
                next[appliedAction.filmId] = Date.now();
              } else {
                delete next[appliedAction.filmId];
              }
              return next;
            });
          } else {
            setFilmRatings((current) => {
              const next = { ...current };
              next[appliedAction.filmId] = appliedAction.rating;
              return next;
            });
            setRatingUpdatedAtMs((current) => {
              const next = { ...current };
              if (typeof appliedAction.rating === "number") {
                next[appliedAction.filmId] = Date.now();
              } else {
                delete next[appliedAction.filmId];
              }
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
    setRatingUpdatedAtMs({ ...initialRatingUpdatedAtMs });
    setSavedAtMs({ ...initialSavedAtMs });
    setRatingsReady(true);
    listsHydratedFromSsrRef.current = initialAuth !== null;
  }, [
    initialAuth,
    initialFilmRatings,
    initialSavedFilmIds,
    initialRatingUpdatedAtMs,
    initialSavedAtMs,
  ]);

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
          applyServerListTimestamps(state.ratingUpdatedAtMs, state.savedAtMs);
        } else {
          applyServerListTimestamps(state.ratingUpdatedAtMs);
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
  }, [
    applyPendingActionForProfile,
    applyServerFilmRatings,
    applyServerListTimestamps,
  ]);

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
      setSavedAtMs((current) => {
        const next = { ...current };
        if (saved) {
          next[film.id] = Date.now();
        } else {
          delete next[film.id];
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
        [filmId]: rating,
      }));
      setRatingUpdatedAtMs((current) => {
        const next = { ...current };
        if (typeof rating === "number") {
          next[filmId] = Date.now();
        } else {
          delete next[filmId];
        }
        return next;
      });
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
          filmRatings,
          ratingUpdatedAtMs,
          savedAtMs
        );
      }

      storePendingFilmActionForSession(action);
      setModalOpen(true);
    },
    [filmRatings, ratingUpdatedAtMs, savedAtMs, savedFilmIds]
  );

  const revertPreAuthSnapshot = useCallback(() => {
    const snapshot = preAuthSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    bumpInteractionGeneration();
    setSavedFilmIds(snapshot.savedFilmIds);
    setFilmRatings(snapshot.filmRatings);
    setRatingUpdatedAtMs(snapshot.ratingUpdatedAtMs);
    setSavedAtMs(snapshot.savedAtMs);
    preAuthSnapshotRef.current = null;
  }, [bumpInteractionGeneration]);

  const handleModalClose = useCallback(() => {
    clearPendingFilmActionFromSession();
    revertPreAuthSnapshot();
    setModalOpen(false);
  }, [revertPreAuthSnapshot]);

  return {
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
    postAuthPath,
  };
}
