import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ANNECY_2024_FEATURE_AWARDS } from "@/lib/festivals/annecy-2024-feature-awards.mjs";
import { annecyFeatureAwardYearOptions } from "@/lib/festivals/annecy-award-years.mjs";
import { FESTIVALS_INDEX_PATH } from "@/lib/festivals/public-festival-paths.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const YEAR = 2024;
const PATH = `/festivals/${YEAR}/annecy`;
const DESCRIPTION =
  ANNECY_2024_FEATURE_AWARDS.metaDescription ??
  ANNECY_2024_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: ANNECY_2024_FEATURE_AWARDS,
    path: PATH,
    description: DESCRIPTION,
    titleH1: ANNECY_2024_FEATURE_AWARDS.documentTitle ?? ANNECY_2024_FEATURE_AWARDS.h1,
  });
}

export default function Annecy2024FeatureAwardsPage() {
  return (
    <GuideDocumentPage
      guide={ANNECY_2024_FEATURE_AWARDS}
      path={PATH}
      description={DESCRIPTION}
      sectionLink={{ href: FESTIVALS_INDEX_PATH, label: "Festivals" }}
      pageTestId="annecy-2024-feature-awards"
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
