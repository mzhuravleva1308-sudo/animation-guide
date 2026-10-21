import type { Metadata } from "next";
import GuidePageClient from "@/components/guides/GuidePageClient";
import { OTTAWA_2026_FEATURE_AWARDS } from "@/lib/festivals/ottawa-2026-feature-awards.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_YEAR_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
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

const PATH = `/festivals/${CURRENT_FESTIVAL_YEAR}/ottawa`;
const DESCRIPTION =
  OTTAWA_2026_FEATURE_AWARDS.metaDescription ??
  OTTAWA_2026_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(OTTAWA_2026_FEATURE_AWARDS);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1:
      OTTAWA_2026_FEATURE_AWARDS.documentTitle ??
      OTTAWA_2026_FEATURE_AWARDS.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default async function Ottawa2026FeatureAwardsPage() {
  const page = await loadGuidePage(OTTAWA_2026_FEATURE_AWARDS);
  const showJsonLd = !page.loadError && page.missingTitles.length === 0;
  const jsonLd = showJsonLd
    ? buildGuideJsonLd({
        origin: PUBLIC_SITE_ORIGIN,
        path: PATH,
        name: OTTAWA_2026_FEATURE_AWARDS.h1,
        description: DESCRIPTION,
        filmTitles: listGuideFilmTitles(OTTAWA_2026_FEATURE_AWARDS),
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
        content={OTTAWA_2026_FEATURE_AWARDS}
        postAuthPath={PATH}
        sectionLink={{
          href: FESTIVALS_YEAR_PATH(CURRENT_FESTIVAL_YEAR),
          label: "Festivals",
        }}
        pageTestId="ottawa-2026-feature-awards"
        initialFilmRatings={page.initialFilmRatings}
        initialSavedFilmIds={page.initialSavedFilmIds}
        initialRatingUpdatedAtMs={page.initialRatingUpdatedAtMs}
        initialSavedAtMs={page.initialSavedAtMs}
        catalogUpdatedLabel={page.catalogUpdatedLabel}
      />
    </>
  );
}
