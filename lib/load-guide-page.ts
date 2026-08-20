import { cache } from "react";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";
import { MEDIA_TYPE } from "@/lib/media-type";
import {
  applyPublicCatalogMediaTypeFilter,
  applyPublicCatalogVisibilityFilter,
} from "@/lib/public-catalog-films.mjs";
import {
  resolveGuideAnchorFilm,
  resolveGuideFilms,
} from "@/lib/guides/resolve-guide-films.mjs";
import { supabase } from "@/lib/supabase";
import type { Film } from "@/types/film";

type GuidePageContent = {
  slug: string;
  h1: string;
  documentTitle?: string;
  metaDescription?: string;
  intro: string[];
  personalNote: string;
  cta: { href: string; label: string };
  relatedGuides?: { href: string; label: string }[];
  anchorTitle?: string;
  groups: {
    heading: string;
    description: string;
    films: { title: string; note?: string }[];
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
      items: { film: Film; note: string | null }[];
    }[],
    missingTitles: resolved.missingTitles as string[],
  };
});

type GuideCoverFilm = Pick<Film, "id" | "title" | "poster_url" | "image_url">;

export const loadGuideCoverFilms = cache(async (titles: string[]) => {
  const uniqueTitles = [
    ...new Set(
      titles.map((title) => String(title ?? "").trim()).filter(Boolean)
    ),
  ];

  if (uniqueTitles.length === 0) {
    return { films: [] as GuideCoverFilm[], loadError: null };
  }

  const { data, error } = await applyPublicCatalogMediaTypeFilter(
    applyPublicCatalogVisibilityFilter(
      supabase
        .from("films")
        .select("id, title, poster_url, image_url")
        .in("title", uniqueTitles)
    ),
    MEDIA_TYPE.animation
  );

  return {
    films: ((data ?? []) as GuideCoverFilm[]).filter((film) =>
      uniqueTitles.includes(film.title)
    ),
    loadError: error?.message ?? null,
  };
});
