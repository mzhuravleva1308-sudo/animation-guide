import type { Metadata } from "next";
import GuidePageClient from "@/components/guides/GuidePageClient";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "@/lib/guides/indie-animated-movies-beyond-studios.mjs";
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

const PATH = `/guides/${INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug}`;
const DESCRIPTION =
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.metaDescription ??
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1:
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.documentTitle ??
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default async function IndieAnimatedMoviesBeyondStudiosGuidePage() {
  const page = await loadGuidePage(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE);
  const showJsonLd = !page.loadError && page.missingTitles.length === 0;
  const jsonLd = showJsonLd
    ? buildGuideJsonLd({
        origin: PUBLIC_SITE_ORIGIN,
        path: PATH,
        name: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
        description: DESCRIPTION,
        filmTitles: listGuideFilmTitles(
          INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE
        ),
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
        content={INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE}
        postAuthPath={PATH}
        anchorFilm={page.anchorFilm}
        initialFilmRatings={page.initialFilmRatings}
        initialSavedFilmIds={page.initialSavedFilmIds}
        initialRatingUpdatedAtMs={page.initialRatingUpdatedAtMs}
        initialSavedAtMs={page.initialSavedAtMs}
        catalogUpdatedLabel={page.catalogUpdatedLabel}
      />
    </>
  );
}
