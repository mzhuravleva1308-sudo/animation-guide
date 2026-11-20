import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { BEST_STOP_MOTION_MOVIES_GUIDE } from "@/lib/guides/best-stop-motion-movies.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${BEST_STOP_MOTION_MOVIES_GUIDE.slug}`;
const DESCRIPTION =
  BEST_STOP_MOTION_MOVIES_GUIDE.metaDescription ??
  BEST_STOP_MOTION_MOVIES_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: BEST_STOP_MOTION_MOVIES_GUIDE,
    path: PATH,
    description: DESCRIPTION,
    titleH1:
      BEST_STOP_MOTION_MOVIES_GUIDE.documentTitle ??
      BEST_STOP_MOTION_MOVIES_GUIDE.h1,
  });
}

export default function BestStopMotionMoviesGuidePage() {
  return (
    <GuideDocumentPage
      guide={BEST_STOP_MOTION_MOVIES_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
