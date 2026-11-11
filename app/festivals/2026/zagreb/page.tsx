import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ZAGREB_2026_FEATURE_AWARDS } from "@/lib/festivals/zagreb-2026-feature-awards.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_INDEX_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/festivals/${CURRENT_FESTIVAL_YEAR}/zagreb`;
const DESCRIPTION =
  ZAGREB_2026_FEATURE_AWARDS.metaDescription ??
  ZAGREB_2026_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: ZAGREB_2026_FEATURE_AWARDS,
    path: PATH,
    description: DESCRIPTION,
    titleH1: ZAGREB_2026_FEATURE_AWARDS.documentTitle ?? ZAGREB_2026_FEATURE_AWARDS.h1,
  });
}

export default function Zagreb2026FeatureAwardsPage() {
  return (
    <GuideDocumentPage
      guide={ZAGREB_2026_FEATURE_AWARDS}
      path={PATH}
      description={DESCRIPTION}
      sectionLink={{ href: FESTIVALS_INDEX_PATH, label: "Festivals" }}
      pageTestId="zagreb-2026-feature-awards"
    />
  );
}
