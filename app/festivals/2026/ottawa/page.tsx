import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { OTTAWA_2026_FEATURE_AWARDS } from "@/lib/festivals/ottawa-2026-feature-awards.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_INDEX_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/festivals/${CURRENT_FESTIVAL_YEAR}/ottawa`;
const DESCRIPTION =
  OTTAWA_2026_FEATURE_AWARDS.metaDescription ??
  OTTAWA_2026_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: OTTAWA_2026_FEATURE_AWARDS,
    path: PATH,
    description: DESCRIPTION,
    titleH1: OTTAWA_2026_FEATURE_AWARDS.documentTitle ?? OTTAWA_2026_FEATURE_AWARDS.h1,
  });
}

export default function Ottawa2026FeatureAwardsPage() {
  return (
    <GuideDocumentPage
      guide={OTTAWA_2026_FEATURE_AWARDS}
      path={PATH}
      description={DESCRIPTION}
      sectionLink={{ href: FESTIVALS_INDEX_PATH, label: "Festivals" }}
      pageTestId="ottawa-2026-feature-awards"
    />
  );
}
