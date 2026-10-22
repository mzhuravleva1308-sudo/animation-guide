import type { Metadata } from "next";
import GuidePageClient from "@/components/guides/GuidePageClient";
import { ANNECY_2025_FEATURE_AWARDS } from "@/lib/festivals/annecy-2025-feature-awards.mjs";
import { annecyFeatureAwardYearOptions } from "@/lib/festivals/annecy-award-years.mjs";
import { FESTIVALS_INDEX_PATH } from "@/lib/festivals/public-festival-paths.mjs";
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

const YEAR = 2025;
const PATH = `/festivals/${YEAR}/annecy`;
const DESCRIPTION =
  ANNECY_2025_FEATURE_AWARDS.metaDescription ??
  ANNECY_2025_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(ANNECY_2025_FEATURE_AWARDS);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1:
      ANNECY_2025_FEATURE_AWARDS.documentTitle ??
      ANNECY_2025_FEATURE_AWARDS.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default async function Annecy2025FeatureAwardsPage() {
  const page = await loadGuidePage(ANNECY_2025_FEATURE_AWARDS);
  const showJsonLd = !page.loadError && page.missingTitles.length === 0;
  const jsonLd = showJsonLd
    ? buildGuideJsonLd({
        origin: PUBLIC_SITE_ORIGIN,
        path: PATH,
        name: ANNECY_2025_FEATURE_AWARDS.h1,
        description: DESCRIPTION,
        filmTitles: listGuideFilmTitles(ANNECY_2025_FEATURE_AWARDS),
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
        content={ANNECY_2025_FEATURE_AWARDS}
        postAuthPath={PATH}
        sectionLink={{
          href: FESTIVALS_INDEX_PATH,
          label: "Festivals",
        }}
        pageTestId="annecy-2025-feature-awards"
        yearSwitcher={{
          years: annecyFeatureAwardYearOptions(YEAR).map(({ year, href }) => ({
            year,
            href,
          })),
          activeYear: YEAR,
        }}
        initialFilmRatings={page.initialFilmRatings}
        initialSavedFilmIds={page.initialSavedFilmIds}
        initialRatingUpdatedAtMs={page.initialRatingUpdatedAtMs}
        initialSavedAtMs={page.initialSavedAtMs}
        catalogUpdatedLabel={page.catalogUpdatedLabel}
      />
    </>
  );
}
