import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ZAGREB_2026_FEATURE_AWARDS } from "@/lib/festivals/zagreb-2026-feature-awards.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_INDEX_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/festivals/${CURRENT_FESTIVAL_YEAR}/zagreb`;
const DESCRIPTION =
  ZAGREB_2026_FEATURE_AWARDS.metaDescription ??
  ZAGREB_2026_FEATURE_AWARDS.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(ZAGREB_2026_FEATURE_AWARDS);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1:
      ZAGREB_2026_FEATURE_AWARDS.documentTitle ??
      ZAGREB_2026_FEATURE_AWARDS.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
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
