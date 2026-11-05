import { cache } from "react";
import { attachPublicFestivalBadges } from "@/lib/attach-public-festival-badges";
import { getAuthUserSummary } from "@/lib/auth/session";
import { normalizeWatchAvailability } from "@/lib/film-watch-availability.mjs";
import {
  PUBLIC_CATALOG_FILM_FIELDS_WITH_WATCH,
  PUBLIC_CATALOG_FILM_FIELDS_WITHOUT_WATCH,
  isMissingWatchAvailabilityColumnError,
} from "@/lib/films-select-fields.mjs";
import {
  listGuideFilmTitles,
  resolveGuideAnchorFilm,
  resolveGuideFilms,
} from "@/lib/guides/resolve-guide-films.mjs";
import { loadCatalogUpdatedLabel } from "@/lib/load-catalog-last-updated";
import { MEDIA_TYPE } from "@/lib/media-type";
import { normalizeFilms } from "@/lib/normalize-film";
import {
  applyPublicCatalogMediaTypeFilter,
  applyPublicCatalogVisibilityFilter,
} from "@/lib/public-catalog-films.mjs";
import { supabase } from "@/lib/supabase";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { FestivalBadge } from "@/types/festival-badge";
import type { Film } from "@/types/film";

type GuidePageContent = {
  slug: string;
  h1: string;
  documentTitle?: string;
  metaDescription?: string;
  intro: string[];
  personalNote: string;
  cta: { href: string; label: string };
  relatedGuides?: { href: string; label: string }[];
  anchorTitle?: string;
  groups: {
    heading: string;
    description: string;
    films: { title: string; note?: string }[];
  }[];
};

function guideTitlesToLoad(guide: GuidePageContent): string[] {
  const titles = [
    ...listGuideFilmTitles(guide),
    ...(guide.anchorTitle ? [guide.anchorTitle] : []),
  ];
  return [...new Set(titles.map((title) => String(title ?? "").trim()).filter(Boolean))];
}

/** Watch button only needs presence; drop regions/deep-links from the RSC payload. */
function compactGuideFilmForClient(film: Film): Film {
  const watch = normalizeWatchAvailability(film.watch_availability);
  const watch_availability = watch?.offers.length
    ? {
        source: "tmdb" as const,
        checked_at: watch.checked_at,
        tmdb_id: watch.tmdb_id,
        offers: [
          {
            provider: "available",
            type: "flatrate" as const,
            regions: ["US"],
          },
        ],
      }
    : null;

  const festival_badges = Array.isArray(film.festival_badges)
    ? film.festival_badges.map(
        (badge): FestivalBadge => ({
          id: badge.id,
          label: badge.label,
          fullName: "",
          description: "",
          color: "",
          backgroundColor: "",
        })
      )
    : film.festival_badges;

  return {
    ...film,
    watch_availability,
    festival_badges,
  };
}

async function loadGuideFilmsByTitles(titles: string[]): Promise<{
  films: Film[];
  loadError: string | null;
}> {
  if (titles.length === 0) {
    return { films: [], loadError: null };
  }

  let result = await applyPublicCatalogMediaTypeFilter(
    applyPublicCatalogVisibilityFilter(
      supabase
        .from("films")
        .select(PUBLIC_CATALOG_FILM_FIELDS_WITH_WATCH)
        .in("title", titles)
    ),
    MEDIA_TYPE.animation
  );

  if (
    result.error &&
    isMissingWatchAvailabilityColumnError(result.error.message)
  ) {
    result = await applyPublicCatalogMediaTypeFilter(
      applyPublicCatalogVisibilityFilter(
        supabase
          .from("films")
          .select(PUBLIC_CATALOG_FILM_FIELDS_WITHOUT_WATCH)
          .in("title", titles)
      ),
      MEDIA_TYPE.animation
    );
  }

  if (result.error) {
    return { films: [], loadError: result.error.message };
  }

  const normalized = normalizeFilms((result.data as Film[] | null) ?? []);
  const withBadges = await attachPublicFestivalBadges(supabase, normalized);
  return {
    films: withBadges.map(compactGuideFilmForClient),
    loadError: null,
  };
}

async function loadGuideViewerState(profileId: string | null): Promise<{
  initialFilmRatings: Record<string, number>;
  initialSavedFilmIds: string[];
  initialRatingUpdatedAtMs: Record<string, number>;
  initialSavedAtMs: Record<string, number>;
}> {
  if (!profileId) {
    return {
      initialFilmRatings: {},
      initialSavedFilmIds: [],
      initialRatingUpdatedAtMs: {},
      initialSavedAtMs: {},
    };
  }

  try {
    const admin = getAdminSupabase();
    const [ratingsResult, savedResult] = await Promise.all([
      admin
        .from("film_ratings")
        .select("film_id, rating, updated_at")
        .eq("profile_id", profileId),
      admin
        .from("profile_film_lists")
        .select("film_id, created_at")
        .eq("profile_id", profileId)
        .eq("list_type", "to_watch"),
    ]);

    if (ratingsResult.error) {
      console.error("[guide] ratings load error", ratingsResult.error);
    }
    if (savedResult.error) {
      console.error("[guide] saved list load error", savedResult.error);
    }

    const initialFilmRatings: Record<string, number> = {};
    const initialRatingUpdatedAtMs: Record<string, number> = {};
    for (const row of (ratingsResult.data as
      | { film_id: string; rating: number; updated_at?: string | null }[]
      | null) ?? []) {
      if (!row.film_id || typeof row.rating !== "number") continue;
      initialFilmRatings[row.film_id] = row.rating;
      if (row.updated_at) {
        const ms = Date.parse(row.updated_at);
        if (Number.isFinite(ms)) {
          initialRatingUpdatedAtMs[row.film_id] = ms;
        }
      }
    }

    const initialSavedFilmIds: string[] = [];
    const initialSavedAtMs: Record<string, number> = {};
    for (const row of (savedResult.data as
      | { film_id: string; created_at?: string | null }[]
      | null) ?? []) {
      if (!row.film_id) continue;
      initialSavedFilmIds.push(row.film_id);
      if (row.created_at) {
        const ms = Date.parse(row.created_at);
        if (Number.isFinite(ms)) {
          initialSavedAtMs[row.film_id] = ms;
        }
      }
    }

    return {
      initialFilmRatings,
      initialSavedFilmIds,
      initialRatingUpdatedAtMs,
      initialSavedAtMs,
    };
  } catch (error) {
    console.error("[guide] viewer state unavailable", error);
    return {
      initialFilmRatings: {},
      initialSavedFilmIds: [],
      initialRatingUpdatedAtMs: {},
      initialSavedAtMs: {},
    };
  }
}

/**
 * Guide + festival award pages: load only the titled films (not the full catalog).
 */
export const loadGuidePage = cache(async (guide: GuidePageContent) => {
  const titles = guideTitlesToLoad(guide);

  const [filmsResult, catalogUpdatedLabel, authAndViewer] = await Promise.all([
    loadGuideFilmsByTitles(titles),
    loadCatalogUpdatedLabel(),
    (async () => {
      const auth = await getAuthUserSummary();
      const viewer = await loadGuideViewerState(auth?.profile?.id ?? null);
      return { auth, viewer };
    })(),
  ]);

  const { auth, viewer } = authAndViewer;
  const films = filmsResult.films;
  const resolved = resolveGuideFilms(guide, films);
  const anchorFilm = resolveGuideAnchorFilm(guide, films) as Film | null;

  return {
    auth,
    loadError: filmsResult.loadError,
    initialFilmRatings: viewer.initialFilmRatings,
    initialSavedFilmIds: viewer.initialSavedFilmIds,
    initialRatingUpdatedAtMs: viewer.initialRatingUpdatedAtMs,
    initialSavedAtMs: viewer.initialSavedAtMs,
    catalogUpdatedLabel,
    anchorFilm,
    groups: resolved.groups as {
      heading: string;
      description: string;
      items: { film: Film; note: string | null }[];
    }[],
    missingTitles: resolved.missingTitles as string[],
  };
});

type GuideCoverFilm = Pick<Film, "id" | "title" | "poster_url" | "image_url">;

export const loadGuideCoverFilms = cache(async (titles: string[]) => {
  const uniqueTitles = [
    ...new Set(
      titles.map((title) => String(title ?? "").trim()).filter(Boolean)
    ),
  ];

  if (uniqueTitles.length === 0) {
    return { films: [] as GuideCoverFilm[], loadError: null };
  }

  const { data, error } = await applyPublicCatalogMediaTypeFilter(
    applyPublicCatalogVisibilityFilter(
      supabase
        .from("films")
        .select("id, title, poster_url, image_url")
        .in("title", uniqueTitles)
    ),
    MEDIA_TYPE.animation
  );

  return {
    films: ((data ?? []) as GuideCoverFilm[]).filter((film) =>
      uniqueTitles.includes(film.title)
    ),
    loadError: error?.message ?? null,
  };
});
