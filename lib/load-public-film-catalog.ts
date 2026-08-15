import { unstable_cache } from "next/cache";
import { attachPublicFestivalBadges } from "@/lib/attach-public-festival-badges";
import {
  createCatalogPageLoadTimer,
  timeAsyncStage,
  timeSyncStage,
} from "@/lib/catalog-page-load-log";
import { getAuthUserSummary } from "@/lib/auth/session";
import { canAccessLiveActionCatalog } from "@/lib/live-action-catalog-access";
import {
  MEDIA_TYPE,
  SCORE_MODE,
  normalizeMediaType,
  normalizeScoreMode,
  parseCatalogRankingParams,
  type CatalogRankingParams,
  type MediaType,
} from "@/lib/media-type";
import { normalizeFilms } from "@/lib/normalize-film";
import {
  countLikedHighRatingsForRanking,
  sortFilmsByColdStart,
  sortFilmsForDualModeCatalog,
} from "@/lib/profile-film-scoring";
import {
  assertCacheablePublicCatalogBase,
  isPublicCatalogBaseLoadError,
} from "@/lib/public-catalog-base-cache.mjs";
import {
  applyPublicCatalogMediaTypeFilter,
  applyPublicCatalogVisibilityFilter,
} from "@/lib/public-catalog-films.mjs";
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
  "media_type",
].join(", ");

type ProfileRatingRow = {
  film_id: string;
  rating: number;
  media_type: MediaType;
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
  profileId: string,
  ranking: CatalogRankingParams
): Promise<PersonalizedCatalogData> {
  try {
    const adminSupabase = getAdminSupabase();

    const [ratingsTimed, savedTimed] = await Promise.all([
      timeAsyncStage(() =>
        adminSupabase
          .from("film_ratings")
          .select("film_id, rating, films(media_type)")
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

    const ratings: ProfileRatingRow[] = (
      (ratingRows as
        | {
            film_id: string;
            rating: number;
            films?: { media_type?: string | null } | null;
          }[]
        | null) ?? []
    ).map((row) => ({
      film_id: row.film_id,
      rating: row.rating,
      media_type: normalizeMediaType(
        row.films?.media_type,
        MEDIA_TYPE.animation
      ),
    }));

    const unlockCount = countLikedHighRatingsForRanking(ratings, {
      scoreMode: ranking.scoreMode,
      sourceMedia: ranking.sourceMedia,
      mediaType: ranking.mediaType,
    });

    if (unlockCount === 0) {
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
        .eq("score_mode", ranking.scoreMode)
        .eq("source_media", ranking.sourceMedia)
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

async function loadPublicCatalogBaseUncached(
  mediaType: string
): Promise<PublicCatalogBase> {
  const [filmsTimed, awardIdsTimed] = await Promise.all([
    timeAsyncStage(() =>
      applyPublicCatalogMediaTypeFilter(
        applyPublicCatalogVisibilityFilter(
          supabase.from("films").select(PUBLIC_CATALOG_FILM_FIELDS)
        ),
        mediaType
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

function getCachedPublicCatalogBaseLoader(mediaType: string) {
  return unstable_cache(
    async (): Promise<PublicCatalogBase> =>
      assertCacheablePublicCatalogBase(
        await loadPublicCatalogBaseUncached(mediaType)
      ) as PublicCatalogBase,
    [
      "public-film-catalog-base",
      "fields-v3-media",
      "badges-slim",
      "no-error-cache-v1",
      mediaType,
    ],
    { revalidate: 120 }
  );
}

async function loadPublicCatalogBase(
  mediaType: string
): Promise<PublicCatalogBase> {
  try {
    return await getCachedPublicCatalogBaseLoader(mediaType)();
  } catch (error) {
    if (isPublicCatalogBaseLoadError(error)) {
      return error.publicCatalogBase as PublicCatalogBase;
    }
    return loadPublicCatalogBaseUncached(mediaType);
  }
}

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

function resolveCatalogRankingForViewer(
  rawParams: { media?: string | null; sort?: string | null } | undefined,
  email: string | null | undefined
): CatalogRankingParams & { showLiveActionTab: boolean } {
  const parsed = parseCatalogRankingParams(rawParams ?? {});
  const showLiveActionTab = canAccessLiveActionCatalog(email);

  if (!showLiveActionTab) {
    return {
      mediaType: MEDIA_TYPE.animation,
      scoreMode: SCORE_MODE.native,
      sourceMedia: MEDIA_TYPE.animation,
      sortParam: "native",
      showLiveActionTab: false,
    };
  }

  // Early-access Films tab: default to cross-from-animation when sort omitted
  // (native LA likes/scores are usually empty; animation taste is the unlock).
  if (
    parsed.mediaType === MEDIA_TYPE.liveAction &&
    parsed.sortParam === "native" &&
    !(rawParams?.sort)
  ) {
    return {
      mediaType: MEDIA_TYPE.liveAction,
      scoreMode: SCORE_MODE.crossMedia,
      sourceMedia: MEDIA_TYPE.animation,
      sortParam: "cross_from_animation",
      showLiveActionTab: true,
    };
  }

  return { ...parsed, showLiveActionTab: true };
}

export async function loadPublicFilmCatalog(options?: {
  media?: string | null;
  sort?: string | null;
}) {
  const timer = createCatalogPageLoadTimer();

  const authTimed = await timeAsyncStage(() => getAuthUserSummary());
  const auth = authTimed.value;
  const profileId = auth?.profile?.id ?? null;

  const ranking = resolveCatalogRankingForViewer(
    { media: options?.media, sort: options?.sort },
    auth?.email
  );

  const publicBasePromise = timeAsyncStage(() =>
    loadPublicCatalogBase(ranking.mediaType)
  );

  const personalizedPromise = profileId
    ? loadPersonalizedCatalogRankingData(profileId, ranking)
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
      scoreMode: ranking.scoreMode,
      sourceMedia: ranking.sourceMedia,
      mediaType: ranking.mediaType,
    });

    if (sorted.reason === "smart-scores-unavailable") {
      console.warn("[catalog] smart ranking unavailable; using cold-start", {
        scoresFallbackCause: sorted.scoresFallbackCause,
        scoreMode: ranking.scoreMode,
        sourceMedia: ranking.sourceMedia,
        mediaType: ranking.mediaType,
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
    likedHighRatedCount: countLikedHighRatingsForRanking(personalized.ratings, {
      scoreMode: ranking.scoreMode,
      sourceMedia: ranking.sourceMedia,
      mediaType: ranking.mediaType,
    }),
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

  return {
    auth,
    films,
    awardWinningFilmIds: publicBase.awardWinningFilmIds,
    loadError: publicBase.loadError,
    pageSize: PUBLIC_CATALOG_PAGE_SIZE,
    initialFilmRatings: ratingsRecordFromRows(personalized.ratings),
    initialSavedFilmIds: personalized.savedFilmIds,
    mediaType: ranking.mediaType,
    scoreMode: normalizeScoreMode(ranking.scoreMode),
    sourceMedia: ranking.sourceMedia,
    sortParam: ranking.sortParam,
    showLiveActionTab: ranking.showLiveActionTab,
  };
}
