import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "@/lib/guides/indie-animated-movies-beyond-studios.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug}`;
const DESCRIPTION =
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.metaDescription ??
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1:
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.documentTitle ??
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
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
