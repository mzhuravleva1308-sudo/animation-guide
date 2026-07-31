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

  try {
    const filmIds = films.map((film) => film.id);
    const [claimsByFilmId, recognitionsByFilmId] = await Promise.all([
      loadPublicFestivalClaimsByFilmIds(supabase, filmIds),
      loadFilmFestivalRecognitionsByFilmIds(supabase, filmIds, {
        fields: PUBLIC_FESTIVAL_RECOGNITION_BADGE_FIELDS,
      }),
    ]);
    return enrichFilmsWithFestivalBadges(
      films,
      claimsByFilmId,
      recognitionsByFilmId
    );
  } catch {
    return enrichFilmsWithFestivalBadges(films, new Map());
  }
}
