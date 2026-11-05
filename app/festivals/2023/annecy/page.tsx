import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ANNECY_2023_FEATURE_AWARDS } from "@/lib/festivals/annecy-2023-feature-awards.mjs";
import { annecyFeatureAwardYearOptions } from "@/lib/festivals/annecy-award-years.mjs";
import { FESTIVALS_INDEX_PATH } from "@/lib/festivals/public-festival-paths.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const YEAR = 2023;
const PATH = `/festivals/${YEAR}/annecy`;
const DESCRIPTION =
  ANNECY_2023_FEATURE_AWARDS.metaDescription ??
  ANNECY_2023_FEATURE_AWARDS.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: ANNECY_2023_FEATURE_AWARDS.documentTitle ?? ANNECY_2023_FEATURE_AWARDS.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function Annecy2023FeatureAwardsPage() {
  return (
    <GuideDocumentPage
      guide={ANNECY_2023_FEATURE_AWARDS}
      path={PATH}
      description={DESCRIPTION}
      sectionLink={{ href: FESTIVALS_INDEX_PATH, label: "Festivals" }}
      pageTestId="annecy-2023-feature-awards"
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
