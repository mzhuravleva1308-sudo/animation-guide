import { buildFilmFestivalBadges } from "@/lib/festival-badge";
import type { FestivalBadge } from "@/types/festival-badge";
import type { Film } from "@/types/film";

type FestivalClaimRow = {
  canonical_festival_id?: string | null;
  raw_festival_name?: string | null;
};

export function enrichFilmsWithFestivalBadges(
  films: Film[],
  claimsByFilmId: Map<string, FestivalClaimRow[]>
): Film[] {
  return films.map((film) => {
    const badges: FestivalBadge[] = buildFilmFestivalBadges({
      catalogFestival: film.festival ?? null,
      claims: claimsByFilmId.get(film.id) ?? [],
    });

    if (badges.length === 0) {
      return film;
    }

    return {
      ...film,
      festival_badges: badges,
    };
  });
}
