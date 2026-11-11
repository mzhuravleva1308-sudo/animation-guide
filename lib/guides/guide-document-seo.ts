import type { Metadata } from "next";
import { getFilmPosterUrl } from "@/lib/film-poster";
import {
  GUIDE_DOCUMENT_AUTHOR,
} from "@/lib/guides/guide-document-attribution.mjs";
import { findPublicGuideLinkBySlug } from "@/lib/guides/public-guide-links.mjs";
import { loadGuidePage } from "@/lib/load-guide-page";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";
import { SITE_OG_IMAGE_PATH } from "@/lib/site-seo";
import type { Film } from "@/types/film";

export {
  GUIDE_DOCUMENT_AUTHOR,
  GUIDE_DOCUMENT_AUTHOR_ID_FRAGMENT,
  buildGuideDocumentAuthorNode,
  formatGuideEditorialDate,
  guideDocumentAuthorId,
} from "@/lib/guides/guide-document-attribution.mjs";

/** Thrown when guide film data cannot be loaded (transient DB/query failure). */
export class GuideDataLoadError extends Error {
  constructor(message = "Guide data temporarily unavailable") {
    super(message);
    this.name = "GuideDataLoadError";
  }
}

/**
 * Fail the request on transient load errors so crawlers see a 5xx and retry,
 * instead of indexing an empty page. Next App Router has no serviceUnavailable();
 * throwing surfaces as HTTP 500, which Google also treats as temporary.
 */
export function assertGuideFilmsLoaded(page: { loadError: string | null }) {
  if (page.loadError) {
    throw new GuideDataLoadError(page.loadError);
  }
}

export function guideDocumentTitle(h1: string) {
  return `${h1} | Resonale`;
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function resolveGuideShareImage(page: {
  anchorFilm?: Film | null;
  groups: { items: Array<{ film?: Film | null } | Record<string, unknown>> }[];
}): string | null {
  if (page.anchorFilm) {
    return getFilmPosterUrl(page.anchorFilm);
  }
  for (const group of page.groups ?? []) {
    for (const item of group.items ?? []) {
      const film = (item as { film?: Film | null } | null)?.film;
      if (film) {
        return getFilmPosterUrl(film);
      }
    }
  }
  return null;
}

export function buildGuideDocumentMetadata({
  h1,
  description,
  path,
  indexable,
  imageUrl,
  publishedTime,
  modifiedTime,
  authors,
}: {
  h1: string;
  description: string;
  path: string;
  indexable: boolean;
  imageUrl?: string | null;
  publishedTime?: string | null;
  modifiedTime?: string | null;
  authors?: string[];
}): Metadata {
  const title = guideDocumentTitle(h1);
  const resolvedImage = imageUrl || SITE_OG_IMAGE_PATH;
  const authorList =
    authors && authors.length > 0 ? authors : [GUIDE_DOCUMENT_AUTHOR];

  return {
    metadataBase: new URL(PUBLIC_SITE_ORIGIN),
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Resonale",
      locale: "en_US",
      type: "article",
      images: [{ url: resolvedImage }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
      authors: authorList,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [resolvedImage],
    },
    robots: {
      index: indexable,
      follow: true,
    },
  };
}

type GuideRouteContent = Parameters<typeof loadGuidePage>[0];

/**
 * Dynamic guide/festival metadata: poster (or site OG fallback).
 * noindex only when listed films are missing from the catalog (incomplete
 * document). Transient load failures throw → 5xx instead of noindex.
 */
export async function buildGuideRouteMetadata({
  guide,
  path,
  description,
  titleH1,
}: {
  guide: GuideRouteContent;
  path: string;
  description: string;
  titleH1?: string;
}): Promise<Metadata> {
  const page = await loadGuidePage(guide);
  assertGuideFilmsLoaded(page);
  const indexable = page.missingTitles.length === 0;
  const imageUrl = resolveGuideShareImage(page) ?? SITE_OG_IMAGE_PATH;
  const indexMeta = findPublicGuideLinkBySlug(guide.slug);

  return buildGuideDocumentMetadata({
    h1: titleH1 ?? guide.h1,
    description,
    path,
    indexable,
    imageUrl,
    publishedTime: indexMeta?.publishedAt ?? null,
    modifiedTime: indexMeta?.updatedAt ?? null,
  });
}
