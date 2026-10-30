export type AuthenticatedProfileSummary = {
  profileId: string;
  profileSlug: string;
  profileName: string | null;
  tasteProfile: string | null;
  tasteProfileUpdatedAt: string | null;
};

export type ActingCatalogState = {
  profile: AuthenticatedProfileSummary | null;
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number>;
  ratingUpdatedAtMs: Record<string, number>;
  savedAtMs: Record<string, number>;
  viewAs: { userId: string; email: string } | null;
};

type CatalogStateResponse = {
  profile: {
    profileId: string;
    profileSlug: string;
    profileName: string | null;
    tasteProfile: string | null;
    tasteProfileUpdatedAt: string | null;
  } | null;
  savedFilmIds?: string[];
  filmRatings?: Record<string, number>;
  ratingUpdatedAtMs?: Record<string, number>;
  savedAtMs?: Record<string, number>;
  viewAs?: { userId: string; email: string } | null;
};

/**
 * Load acting profile + film lists via the server (honors admin view-as).
 * Replaces direct RLS reads so view-as does not snap back to the admin's lists.
 */
export async function loadActingCatalogState(): Promise<ActingCatalogState | null> {
  const response = await fetch("/api/me/catalog-state", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as CatalogStateResponse;
  const profile = payload.profile?.profileId && payload.profile.profileSlug
    ? {
        profileId: payload.profile.profileId,
        profileSlug: payload.profile.profileSlug,
        profileName: payload.profile.profileName ?? null,
        tasteProfile: payload.profile.tasteProfile ?? null,
        tasteProfileUpdatedAt: payload.profile.tasteProfileUpdatedAt ?? null,
      }
    : null;

  return {
    profile,
    savedFilmIds: new Set(payload.savedFilmIds ?? []),
    filmRatings: { ...(payload.filmRatings ?? {}) },
    ratingUpdatedAtMs: { ...(payload.ratingUpdatedAtMs ?? {}) },
    savedAtMs: { ...(payload.savedAtMs ?? {}) },
    viewAs: payload.viewAs ?? null,
  };
}

export async function resolveAuthenticatedProfile(): Promise<AuthenticatedProfileSummary | null> {
  const state = await loadActingCatalogState();
  return state?.profile ?? null;
}

export async function loadAuthenticatedProfileFilmState(
  profileId: string
): Promise<{
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number>;
  ratingUpdatedAtMs: Record<string, number>;
  savedAtMs: Record<string, number>;
}> {
  const state = await loadActingCatalogState();
  if (!state?.profile || state.profile.profileId !== profileId) {
    return {
      savedFilmIds: new Set(),
      filmRatings: {},
      ratingUpdatedAtMs: {},
      savedAtMs: {},
    };
  }

  return {
    savedFilmIds: state.savedFilmIds,
    filmRatings: state.filmRatings,
    ratingUpdatedAtMs: state.ratingUpdatedAtMs,
    savedAtMs: state.savedAtMs,
  };
}
