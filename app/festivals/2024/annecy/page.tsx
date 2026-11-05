import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ANNECY_2024_FEATURE_AWARDS } from "@/lib/festivals/annecy-2024-feature-awards.mjs";
import { annecyFeatureAwardYearOptions } from "@/lib/festivals/annecy-award-years.mjs";
import { FESTIVALS_INDEX_PATH } from "@/lib/festivals/public-festival-paths.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const YEAR = 2024;
const PATH = `/festivals/${YEAR}/annecy`;
const DESCRIPTION =
  ANNECY_2024_FEATURE_AWARDS.metaDescription ??
  ANNECY_2024_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(ANNECY_2024_FEATURE_AWARDS);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1:
      ANNECY_2024_FEATURE_AWARDS.documentTitle ??
      ANNECY_2024_FEATURE_AWARDS.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
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
