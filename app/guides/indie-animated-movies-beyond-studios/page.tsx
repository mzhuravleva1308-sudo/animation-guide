import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "@/lib/guides/indie-animated-movies-beyond-studios.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug}`;
const DESCRIPTION =
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.metaDescription ??
  INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.documentTitle ?? INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function IndieAnimatedMoviesBeyondStudiosGuidePage() {
  return (
    <GuideDocumentPage
      guide={INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
