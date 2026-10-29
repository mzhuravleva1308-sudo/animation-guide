import { enrichFilmsWithFestivalBadges } from "@/lib/enrich-films-with-festival-badges";
import { loadPublicFestivalClaimsByFilmIds } from "@/lib/load-film-festival-claims-public.mjs";
import {
  loadFilmFestivalRecognitionsByFilmIds,
  PUBLIC_FESTIVAL_RECOGNITION_BADGE_FIELDS,
} from "@/lib/load-film-festival-recognitions.mjs";
import type { Film } from "@/types/film";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function attachPublicFestivalBadges(
  supabase: SupabaseClient,
  films: Film[]
): Promise<Film[]> {
  if (films.length === 0) {
    return films;
  }

  const filmIds = films.map((film) => film.id);

  // Load independently so one source failing still keeps the other badges.
  const [claimsResult, recognitionsResult] = await Promise.allSettled([
    loadPublicFestivalClaimsByFilmIds(supabase, filmIds),
    loadFilmFestivalRecognitionsByFilmIds(supabase, filmIds, {
      fields: PUBLIC_FESTIVAL_RECOGNITION_BADGE_FIELDS,
    }),
  ]);

  const claimsByFilmId =
    claimsResult.status === "fulfilled" ? claimsResult.value : new Map();
  const recognitionsByFilmId =
    recognitionsResult.status === "fulfilled"
      ? recognitionsResult.value
      : new Map();

  return enrichFilmsWithFestivalBadges(
    films,
    claimsByFilmId,
    recognitionsByFilmId
  );
}
