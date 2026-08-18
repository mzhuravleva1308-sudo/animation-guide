import type { Metadata } from "next";
import GuidePageClient from "@/components/guides/GuidePageClient";
import { WEIRD_ANIMATED_MOVIES_GUIDE } from "@/lib/guides/weird-animated-movies.mjs";
import { buildGuideJsonLd } from "@/lib/guides/build-guide-json-ld.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
  serializeJsonLd,
} from "@/lib/guides/guide-document-seo";
import { listGuideFilmTitles } from "@/lib/guides/resolve-guide-films.mjs";
import { loadGuidePage } from "@/lib/load-guide-page";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${WEIRD_ANIMATED_MOVIES_GUIDE.slug}`;
const DESCRIPTION =
  WEIRD_ANIMATED_MOVIES_GUIDE.metaDescription ??
  WEIRD_ANIMATED_MOVIES_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(WEIRD_ANIMATED_MOVIES_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1: WEIRD_ANIMATED_MOVIES_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default async function WeirdAnimatedMoviesGuidePage() {
  const page = await loadGuidePage(WEIRD_ANIMATED_MOVIES_GUIDE);
  const showJsonLd = !page.loadError && page.missingTitles.length === 0;
  const jsonLd = showJsonLd
    ? buildGuideJsonLd({
        origin: PUBLIC_SITE_ORIGIN,
        path: PATH,
        name: WEIRD_ANIMATED_MOVIES_GUIDE.h1,
        description: DESCRIPTION,
        filmTitles: listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE),
      })
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(jsonLd),
          }}
        />
      ) : null}
      <GuidePageClient
        auth={page.auth}
        groups={page.groups}
        missingTitles={page.missingTitles}
        loadError={page.loadError}
        content={WEIRD_ANIMATED_MOVIES_GUIDE}
        postAuthPath={PATH}
        anchorFilm={page.anchorFilm}
        initialFilmRatings={page.initialFilmRatings}
        initialSavedFilmIds={page.initialSavedFilmIds}
        initialRatingUpdatedAtMs={page.initialRatingUpdatedAtMs}
        initialSavedAtMs={page.initialSavedAtMs}
      />
    </>
  );
}
