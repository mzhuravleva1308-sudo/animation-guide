import { enrichFilmsWithFestivalBadges } from "@/lib/enrich-films-with-festival-badges";
import { loadPublicFestivalClaimsByFilmIds } from "@/lib/load-film-festival-claims-public.mjs";
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
    const claimsByFilmId = await loadPublicFestivalClaimsByFilmIds(
      supabase,
      filmIds
    );
    return enrichFilmsWithFestivalBadges(films, claimsByFilmId);
  } catch {
    return enrichFilmsWithFestivalBadges(films, new Map());
  }
}
