import type { Metadata } from "next";
import GuidePageClient from "@/components/guides/GuidePageClient";
import { FILMS_LIKE_FLOW_GUIDE } from "@/lib/guides/films-like-flow.mjs";
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

const PATH = `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`;
const DESCRIPTION =
  FILMS_LIKE_FLOW_GUIDE.metaDescription ?? FILMS_LIKE_FLOW_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(FILMS_LIKE_FLOW_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1: FILMS_LIKE_FLOW_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default async function FilmsLikeFlowGuidePage() {
  const page = await loadGuidePage(FILMS_LIKE_FLOW_GUIDE);
  const showJsonLd = !page.loadError && page.missingTitles.length === 0;
  const jsonLd = showJsonLd
    ? buildGuideJsonLd({
        origin: PUBLIC_SITE_ORIGIN,
        path: PATH,
        name: FILMS_LIKE_FLOW_GUIDE.h1,
        description: DESCRIPTION,
        filmTitles: listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
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
        content={FILMS_LIKE_FLOW_GUIDE}
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
