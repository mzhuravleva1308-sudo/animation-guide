import { attachPublicFestivalBadges } from "@/lib/attach-public-festival-badges";
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

const PUBLIC_CATALOG_FILM_FIELDS = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "festival",
  "poster_url",
  "image_url",
  "external_image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "what_it_is",
  "the_mood",
  "technique",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
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

async function loadPersonalizedCatalogRankingData(profileId: string): Promise<{
  ratings: ProfileRatingRow[];
  scoreRows: ProfileFilmScoreRow[] | null;
  scoresUnavailable: boolean;
}> {
  try {
    const adminSupabase = getAdminSupabase();
    const { data: ratingRows, error: ratingsError } = await adminSupabase
      .from("film_ratings")
      .select("film_id, rating")
      .eq("profile_id", profileId);

    if (ratingsError) {
      console.error("[catalog] ratings load error", ratingsError);
      return {
        ratings: [],
        scoreRows: null,
        scoresUnavailable: true,
      };
    }

    const ratings = (ratingRows as ProfileRatingRow[] | null) ?? [];

    if (countLikedHighRatings(ratings) === 0) {
      return {
        ratings,
        scoreRows: null,
        scoresUnavailable: false,
      };
    }

    const { data: scoreRows, error: scoresError } = await adminSupabase
      .from("profile_film_scores")
      .select("film_id, emotional_score, material_score")
      .eq("profile_id", profileId);

    if (scoresError) {
      console.error("[catalog] profile_film_scores load error", scoresError);
      return {
        ratings,
        scoreRows: null,
        scoresUnavailable: true,
      };
    }

    return {
      ratings,
      scoreRows: (scoreRows as ProfileFilmScoreRow[] | null) ?? [],
      scoresUnavailable: false,
    };
  } catch (error) {
    console.error("[catalog] personalized ranking data unavailable", error);
    return {
      ratings: [],
      scoreRows: null,
      scoresUnavailable: true,
    };
  }
}

export async function loadPublicFilmCatalog() {
  const [
    auth,
    { data: filmsData, error },
    { data: awardRecognitionRows },
  ] = await Promise.all([
    getAuthUserSummary(),
    applyPublicCatalogVisibilityFilter(
      supabase.from("films").select(PUBLIC_CATALOG_FILM_FIELDS)
    ),
    supabase
      .from("film_festival_recognitions")
      .select("film_id")
      .eq("import_source", "manual_verified_major_awards_v1")
      .eq("recognition_type", "award")
      .eq("award_result", "grand_prize"),
  ]);

  const filmsNormalized = await attachPublicFestivalBadges(
    supabase,
    normalizeFilms((filmsData as Film[] | null) ?? [])
  );

  const profileId = auth?.profile?.id ?? null;
  const personalized = profileId
    ? await loadPersonalizedCatalogRankingData(profileId)
    : {
        ratings: [] as ProfileRatingRow[],
        scoreRows: null as ProfileFilmScoreRow[] | null,
        scoresUnavailable: false,
      };

  const ratedFilmIds = new Set(
    personalized.ratings.map((row) => row.film_id).filter(Boolean)
  );
  // Exclude rated films from ranking candidates so balanced normalization matches
  // the legacy profile-page behavior (scores computed over the unrated queue).
  const unratedFilms = filmsNormalized.filter(
    (film) => !ratedFilmIds.has(film.id)
  );
  const ratedFilms = filmsNormalized.filter((film) =>
    ratedFilmIds.has(film.id)
  );

  // Mode decision: guest / no ratings ≥7 → cold-start; else profile_film_scores
  // balanced sort, with cold-start fallback when scores are empty/unavailable.
  const sorted = sortFilmsForDualModeCatalog({
    films: unratedFilms,
    viewer: profileId ? "authenticated" : "guest",
    ratings: personalized.ratings,
    scoreRows: personalized.scoreRows,
    scoresUnavailable: personalized.scoresUnavailable,
  });

  if (sorted.reason === "smart-scores-unavailable") {
    // Structured server warn only — no rating values or film contents.
    console.warn("[catalog] smart ranking unavailable; using cold-start", {
      scoresFallbackCause: sorted.scoresFallbackCause,
      hasLikedHighRating: true,
      profileId,
    });
  }

  // Keep rated films in the server payload so Watched/Saved can derive their
  // lists from the same `films` array. All tab still hides them client-side
  // (optimistic remove/restore without a full catalog reload). Server-side
  // "move to end" is not a second hide — it only preserves payload completeness
  // after excluding rated IDs from the ranked unrated queue above.
  const films = [...sorted.films, ...sortFilmsByColdStart(ratedFilms)];

  const awardWinningFilmIds = Array.from(
    new Set(
      (awardRecognitionRows ?? [])
        .map((row) => row.film_id)
        .filter((filmId): filmId is string => Boolean(filmId))
    )
  );

  return {
    auth,
    films,
    awardWinningFilmIds,
    loadError: error?.message ?? null,
    pageSize: PUBLIC_CATALOG_PAGE_SIZE,
  };
}
