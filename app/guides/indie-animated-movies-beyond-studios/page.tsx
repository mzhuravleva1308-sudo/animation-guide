import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "@/lib/guides/indie-animated-movies-beyond-studios.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug}`;
const DESCRIPTION =
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.metaDescription ??
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE,
    path: PATH,
    description: DESCRIPTION,
    titleH1:
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.documentTitle ??
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
  });
}

export default function IndieAnimatedMoviesBeyondStudiosGuidePage() {
  return (
    <GuideDocumentPage
      guide={INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
