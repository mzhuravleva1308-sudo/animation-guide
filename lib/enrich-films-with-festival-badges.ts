import { buildFilmFestivalBadges } from "@/lib/festival-badge";
import { applyFestivalPageAwardLabels } from "@/lib/festivals/festival-page-award-labels.mjs";
import type { FestivalBadge } from "@/types/festival-badge";
import type { Film } from "@/types/film";

type FestivalClaimRow = {
  canonical_festival_id?: string | null;
  raw_festival_name?: string | null;
};

type FestivalRecognitionRow = {
  canonical_festival_id?: string | null;
  festival_name?: string | null;
};

export function enrichFilmsWithFestivalBadges(
  films: Film[],
  claimsByFilmId: Map<string, FestivalClaimRow[]>,
  recognitionsByFilmId: Map<string, FestivalRecognitionRow[]> = new Map()
): Film[] {
  return films.map((film) => {
    const recognitionClaims = (recognitionsByFilmId.get(film.id) ?? []).map(
      (recognition) => ({
        canonical_festival_id: recognition.canonical_festival_id ?? null,
        raw_festival_name: recognition.festival_name ?? null,
      })
    );
    const baseBadges: FestivalBadge[] = buildFilmFestivalBadges({
      catalogFestival: film.festival ?? null,
      claims: [
        ...(claimsByFilmId.get(film.id) ?? []),
        ...recognitionClaims,
      ],
    });

    if (baseBadges.length === 0) {
      return film;
    }

    const badges = applyFestivalPageAwardLabels(
      baseBadges,
      film.title
    ) as FestivalBadge[];

    return {
      ...film,
      festival_badges: badges,
    };
  });
}
