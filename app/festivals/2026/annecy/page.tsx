import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ANNECY_2026_FEATURE_AWARDS } from "@/lib/festivals/annecy-2026-feature-awards.mjs";
import { annecyFeatureAwardYearOptions } from "@/lib/festivals/annecy-award-years.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_INDEX_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const YEAR = CURRENT_FESTIVAL_YEAR;
const PATH = `/festivals/${YEAR}/annecy`;
const DESCRIPTION =
  ANNECY_2026_FEATURE_AWARDS.metaDescription ??
  ANNECY_2026_FEATURE_AWARDS.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: ANNECY_2026_FEATURE_AWARDS.documentTitle ?? ANNECY_2026_FEATURE_AWARDS.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function Annecy2026FeatureAwardsPage() {
  return (
    <GuideDocumentPage
      guide={ANNECY_2026_FEATURE_AWARDS}
      path={PATH}
      description={DESCRIPTION}
      sectionLink={{ href: FESTIVALS_INDEX_PATH, label: "Festivals" }}
      pageTestId="annecy-2026-feature-awards"
      yearSwitcher={{
        years: annecyFeatureAwardYearOptions(YEAR).map(({ year, href }) => ({
          year,
          href,
        })),
        activeYear: YEAR,
      }}
    />
  );
}
