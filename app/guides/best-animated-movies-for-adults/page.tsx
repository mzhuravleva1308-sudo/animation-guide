import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE } from "@/lib/guides/best-animated-movies-for-adults.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.slug}`;
const DESCRIPTION =
  BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.metaDescription ??
  BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE,
    path: PATH,
    description: DESCRIPTION,
    titleH1:
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.documentTitle ??
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.h1,
  });
}

export default function BestAnimatedMoviesForAdultsGuidePage() {
  return (
    <GuideDocumentPage
      guide={BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
