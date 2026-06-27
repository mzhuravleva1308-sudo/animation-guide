import FilmsPageClient from "@/components/FilmsPageClient";
import { attachPublicFestivalBadges } from "@/lib/attach-public-festival-badges";
import { getAuthUserSummary } from "@/lib/auth/session";
import { normalizeFilms } from "@/lib/normalize-film";
import { sortFilmsByColdStart } from "@/lib/profile-film-scoring";
import { supabase } from "@/lib/supabase";
import { Film } from "@/types/film";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CATALOG_PAGE_SIZE = 100;

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
].join(", ");

export default async function FilmsPage() {
  const [
    auth,
    { data: filmsData, error },
    { data: awardRecognitionRows },
  ] = await Promise.all([
    getAuthUserSummary(),
    supabase.from("films").select(PUBLIC_CATALOG_FILM_FIELDS),
    supabase
      .from("film_festival_recognitions")
      .select("film_id")
      .eq("import_source", "manual_verified_major_awards_v1")
      .eq("recognition_type", "award")
      .eq("award_result", "grand_prize"),
  ]);

  const films = sortFilmsByColdStart(
    await attachPublicFestivalBadges(
      supabase,
      normalizeFilms((filmsData as Film[] | null) ?? [])
    )
  );
  const loadError = error?.message ?? null;

  const awardWinningFilmIds = Array.from(
    new Set(
      (awardRecognitionRows ?? [])
        .map((row) => row.film_id)
        .filter((filmId): filmId is string => Boolean(filmId))
    )
  );
  
  return (
    <FilmsPageClient
      auth={auth}
      films={films}
      awardWinningFilmIds={awardWinningFilmIds}
      pageSize={CATALOG_PAGE_SIZE}
      loadError={loadError}
    />
  );
}
