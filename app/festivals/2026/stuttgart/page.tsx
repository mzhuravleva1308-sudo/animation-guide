import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { STUTTGART_2026_FEATURE_AWARDS } from "@/lib/festivals/stuttgart-2026-feature-awards.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_INDEX_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/festivals/${CURRENT_FESTIVAL_YEAR}/stuttgart`;
const DESCRIPTION =
  STUTTGART_2026_FEATURE_AWARDS.metaDescription ??
  STUTTGART_2026_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: STUTTGART_2026_FEATURE_AWARDS,
    path: PATH,
    description: DESCRIPTION,
    titleH1: STUTTGART_2026_FEATURE_AWARDS.documentTitle ?? STUTTGART_2026_FEATURE_AWARDS.h1,
  });
}

export default function Stuttgart2026FeatureAwardsPage() {
  return (
    <GuideDocumentPage
      guide={STUTTGART_2026_FEATURE_AWARDS}
      path={PATH}
      description={DESCRIPTION}
      sectionLink={{ href: FESTIVALS_INDEX_PATH, label: "Festivals" }}
      pageTestId="stuttgart-2026-feature-awards"
    />
  );
}
