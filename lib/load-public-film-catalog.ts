import { unstable_cache } from "next/cache";
import { attachPublicFestivalBadges } from "@/lib/attach-public-festival-badges";
import {
  createCatalogPageLoadTimer,
  timeAsyncStage,
  timeSyncStage,
} from "@/lib/catalog-page-load-log";
import { getAuthUserSummary } from "@/lib/auth/session";
import { normalizeFilms } from "@/lib/normalize-film";
import {
  countLikedHighRatings,
  sortFilmsByColdStart,
  sortFilmsForDualModeCatalog,
} from "@/lib/profile-film-scoring";
import { applyPublicCatalogVisibilityFilter } from "@/lib/public-catalog-films.mjs";
import { supabase } from "@/lib/supabase";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { Film } from "@/types/film";

export const PUBLIC_CATALOG_PAGE_SIZE = 100;

/**
 * Fields actually rendered on catalog FilmCards / quick filters / cold-start sort.
 * Excludes tag arrays (debug-only on cards; search uses /api/search-films) and
 * import-only image source URLs.
 */
export const PUBLIC_CATALOG_FILM_FIELDS = [
  "id",
  "title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "festival",
  "poster_url",
  "image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "what_it_is",
  "the_mood",
  "technique",
  "cold_start_score",
  "quick_filters",
].join(", ");

type ProfileRatingRow = {
  film_id: string;
  rating: number;
};

type ProfileFilmScoreRow = {
  film_id: string;
  emotional_score: number | null;
  material_score: number | null;
};

type PersonalizedCatalogData = {
  ratings: ProfileRatingRow[];
  savedFilmIds: string[];
  scoreRows: ProfileFilmScoreRow[] | null;
  scoresUnavailable: boolean;
  ratingsMs: number;
  savedMs: number;
  scoresMs: number | null;
};

type PublicCatalogBase = {
  films: Film[];
  awardWinningFilmIds: string[];
  loadError: string | null;
  filmsMs: number;
  awardIdsMs: number;
  festivalBadgesMs: number;
};

const emptyPersonalized = (): PersonalizedCatalogData => ({
  ratings: [],
  savedFilmIds: [],
  scoreRows: null,
  scoresUnavailable: false,
  ratingsMs: 0,
  savedMs: 0,
  scoresMs: null,
});

async function loadPersonalizedCatalogRankingData(
  profileId: string
): Promise<PersonalizedCatalogData> {
  try {
    const adminSupabase = getAdminSupabase();

    // Ratings and saved list are independent — fetch together. Scores only
    // after we know there is at least one liked rating ≥7.
    const [ratingsTimed, savedTimed] = await Promise.all([
      timeAsyncStage(() =>
        adminSupabase
          .from("film_ratings")
          .select("film_id, rating")
          .eq("profile_id", profileId)
      ),
      timeAsyncStage(() =>
        adminSupabase
          .from("profile_film_lists")
          .select("film_id")
          .eq("profile_id", profileId)
          .eq("list_type", "to_watch")
      ),
    ]);

    const { data: ratingRows, error: ratingsError } = ratingsTimed.value;
    const { data: savedRows, error: savedError } = savedTimed.value;

    if (savedError) {
      console.error("[catalog] saved list load error", savedError);
    }

    const savedFilmIds = ((savedRows as { film_id: string }[] | null) ?? [])
      .map((row) => row.film_id)
      .filter(Boolean);

    if (ratingsError) {
      console.error("[catalog] ratings load error", ratingsError);
      return {
        ratings: [],
        savedFilmIds,
        scoreRows: null,
        scoresUnavailable: true,
        ratingsMs: ratingsTimed.ms,
        savedMs: savedTimed.ms,
        scoresMs: null,
      };
    }

    const ratings = (ratingRows as ProfileRatingRow[] | null) ?? [];

    if (countLikedHighRatings(ratings) === 0) {
      return {
        ratings,
        savedFilmIds,
        scoreRows: null,
        scoresUnavailable: false,
        ratingsMs: ratingsTimed.ms,
        savedMs: savedTimed.ms,
        scoresMs: null,
      };
    }

    const {
      value: { data: scoreRows, error: scoresError },
      ms: scoresMs,
    } = await timeAsyncStage(() =>
      adminSupabase
        .from("profile_film_scores")
        .select("film_id, emotional_score, material_score")
        .eq("profile_id", profileId)
    );

    if (scoresError) {
      console.error("[catalog] profile_film_scores load error", scoresError);
      return {
        ratings,
        savedFilmIds,
        scoreRows: null,
        scoresUnavailable: true,
        ratingsMs: ratingsTimed.ms,
        savedMs: savedTimed.ms,
        scoresMs,
      };
    }

    return {
      ratings,
      savedFilmIds,
      scoreRows: (scoreRows as ProfileFilmScoreRow[] | null) ?? [],
      scoresUnavailable: false,
      ratingsMs: ratingsTimed.ms,
      savedMs: savedTimed.ms,
      scoresMs,
    };
  } catch (error) {
    console.error("[catalog] personalized ranking data unavailable", error);
    return {
      ratings: [],
      savedFilmIds: [],
      scoreRows: null,
      scoresUnavailable: true,
      ratingsMs: 0,
      savedMs: 0,
      scoresMs: null,
    };
  }
}

async function loadPublicCatalogBaseUncached(): Promise<PublicCatalogBase> {
  const [filmsTimed, awardIdsTimed] = await Promise.all([
    timeAsyncStage(() =>
      applyPublicCatalogVisibilityFilter(
        supabase.from("films").select(PUBLIC_CATALOG_FILM_FIELDS)
      )
    ),
    timeAsyncStage(() =>
      supabase
        .from("film_festival_recognitions")
        .select("film_id")
        .eq("import_source", "manual_verified_major_awards_v1")
        .eq("recognition_type", "award")
        .eq("award_result", "grand_prize")
    ),
  ]);

  const { data: filmsData, error } = filmsTimed.value;
  const { data: awardRecognitionRows } = awardIdsTimed.value;

  const {
    value: filmsNormalized,
    ms: festivalBadgesMs,
  } = await timeAsyncStage(() =>
    attachPublicFestivalBadges(
      supabase,
      normalizeFilms((filmsData as Film[] | null) ?? [])
    )
  );

  const awardWinningFilmIds = Array.from(
    new Set(
      (awardRecognitionRows ?? [])
        .map((row: { film_id?: string | null }) => row.film_id)
        .filter((filmId): filmId is string => Boolean(filmId))
    )
  );

  return {
    films: filmsNormalized,
    awardWinningFilmIds,
    loadError: error?.message ?? null,
    filmsMs: filmsTimed.ms,
    awardIdsMs: awardIdsTimed.ms,
    festivalBadgesMs,
  };
}

/**
 * PUBLIC-ONLY cache boundary:
 * - Cached body uses the module anon `supabase` client only (no cookies/session/auth).
 * - Cache key is static — never includes profile/user id.
 * - Must not read ratings, saved lists, or profile_film_scores.
 * - Personalized sort + list hydration happen in loadPublicFilmCatalog() AFTER this returns.
 * - Stale window: up to `revalidate` seconds after film/badge/poster URL changes on `/`
 *   (no revalidatePath/Tag in import/admin flows today).
 */
const loadCachedPublicCatalogBase = unstable_cache(
  loadPublicCatalogBaseUncached,
  ["public-film-catalog-base", "fields-v2-slim", "badges-slim"],
  { revalidate: 120 }
);

function ratingsRecordFromRows(
  ratings: ProfileRatingRow[]
): Record<string, number> {
  const record: Record<string, number> = {};
  for (const row of ratings) {
    if (row.film_id && typeof row.rating === "number") {
      record[row.film_id] = row.rating;
    }
  }
  return record;
}

export async function loadPublicFilmCatalog() {
  const timer = createCatalogPageLoadTimer();

  // Kick off shared public work immediately (cacheable).
  const publicBasePromise = timeAsyncStage(() => loadCachedPublicCatalogBase());

  // Resolve auth first so personalization can overlap remaining public work
  // (films/badges on cache miss), instead of waiting for badges then ratings.
  const authTimed = await timeAsyncStage(() => getAuthUserSummary());
  const auth = authTimed.value;
  const profileId = auth?.profile?.id ?? null;

  const personalizedPromise = profileId
    ? loadPersonalizedCatalogRankingData(profileId)
    : Promise.resolve(emptyPersonalized());

  const [publicBaseTimed, personalized] = await Promise.all([
    publicBasePromise,
    personalizedPromise,
  ]);

  const publicBase = publicBaseTimed.value;

  const {
    value: { films, rankingMode, scoresFallbackCause },
    ms: normalizeSortMs,
  } = timeSyncStage(() => {
    const ratedFilmIds = new Set(
      personalized.ratings.map((row) => row.film_id).filter(Boolean)
    );
    const unratedFilms = publicBase.films.filter(
      (film) => !ratedFilmIds.has(film.id)
    );
    const ratedFilms = publicBase.films.filter((film) =>
      ratedFilmIds.has(film.id)
    );

    const sorted = sortFilmsForDualModeCatalog({
      films: unratedFilms,
      viewer: profileId ? "authenticated" : "guest",
      ratings: personalized.ratings,
      scoreRows: personalized.scoreRows,
      scoresUnavailable: personalized.scoresUnavailable,
    });

    if (sorted.reason === "smart-scores-unavailable") {
      console.warn("[catalog] smart ranking unavailable; using cold-start", {
        scoresFallbackCause: sorted.scoresFallbackCause,
        hasLikedHighRating: true,
        profileId,
      });
    }

    return {
      films: [...sorted.films, ...sortFilmsByColdStart(ratedFilms)],
      rankingMode: sorted.mode,
      scoresFallbackCause: sorted.scoresFallbackCause,
    };
  });

  timer.log({
    viewer: profileId ? "authenticated" : "guest",
    filmsCount: films.length,
    likedHighRatedCount: countLikedHighRatings(personalized.ratings),
    scoresRowCount: personalized.scoreRows?.length ?? null,
    rankingMode,
    scoresFallbackCause,
    authMs: authTimed.ms,
    filmsMs: publicBase.filmsMs,
    awardIdsMs: publicBase.awardIdsMs,
    festivalBadgesMs: publicBase.festivalBadgesMs,
    ratingsMs: profileId ? personalized.ratingsMs : null,
    scoresMs: personalized.scoresMs,
    normalizeSortMs,
  });

  if (process.env.NODE_ENV === "development" && profileId) {
    console.info("[catalog] personalization", {
      savedMs: personalized.savedMs,
      ratingsMs: personalized.ratingsMs,
      scoresMs: personalized.scoresMs,
    });
  }

  return {
    auth,
    films,
    awardWinningFilmIds: publicBase.awardWinningFilmIds,
    loadError: publicBase.loadError,
    pageSize: PUBLIC_CATALOG_PAGE_SIZE,
    // Hydrate Watched/Saved without waiting on a second client round-trip.
    initialFilmRatings: ratingsRecordFromRows(personalized.ratings),
    initialSavedFilmIds: personalized.savedFilmIds,
  };
}
