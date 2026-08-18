import { cache } from "react";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";
import { MEDIA_TYPE } from "@/lib/media-type";
import {
  resolveGuideAnchorFilm,
  resolveGuideFilms,
} from "@/lib/guides/resolve-guide-films.mjs";
import type { Film } from "@/types/film";

type GuidePageContent = {
  slug: string;
  h1: string;
  metaDescription?: string;
  intro: string[];
  personalNote: string;
  cta: { href: string; label: string };
  relatedGuides?: { href: string; label: string }[];
  anchorTitle?: string;
  groups: {
    heading: string;
    description: string;
    films: { title: string }[];
  }[];
};

export const loadGuidePage = cache(async (guide: GuidePageContent) => {
  const catalog = await loadPublicFilmCatalog({
    media: MEDIA_TYPE.animation,
  });
  const resolved = resolveGuideFilms(guide, catalog.films as Film[]);
  const anchorFilm = resolveGuideAnchorFilm(
    guide,
    catalog.films as Film[]
  ) as Film | null;

  return {
    auth: catalog.auth,
    loadError: catalog.loadError,
    initialFilmRatings: catalog.initialFilmRatings,
    initialSavedFilmIds: catalog.initialSavedFilmIds,
    initialRatingUpdatedAtMs: catalog.initialRatingUpdatedAtMs,
    initialSavedAtMs: catalog.initialSavedAtMs,
    anchorFilm,
    groups: resolved.groups as {
      heading: string;
      description: string;
      items: { film: Film }[];
    }[],
    missingTitles: resolved.missingTitles as string[],
  };
});
