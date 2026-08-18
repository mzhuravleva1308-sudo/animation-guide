import type { Metadata } from "next";
import { getFilmPosterUrl } from "@/lib/film-poster";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";
import type { Film } from "@/types/film";

export function guideDocumentTitle(h1: string) {
  return `${h1} | Resonale`;
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function resolveGuideShareImage(page: {
  anchorFilm?: Film | null;
  groups: { items: { film: Film }[] }[];
}): string | null {
  const film = page.anchorFilm ?? page.groups[0]?.items[0]?.film ?? null;
  return film ? getFilmPosterUrl(film) : null;
}

export function buildGuideDocumentMetadata({
  h1,
  description,
  path,
  indexable,
  imageUrl,
}: {
  h1: string;
  description: string;
  path: string;
  indexable: boolean;
  imageUrl?: string | null;
}): Metadata {
  const title = guideDocumentTitle(h1);

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
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
    robots: {
      index: indexable,
      follow: true,
    },
  };
}
