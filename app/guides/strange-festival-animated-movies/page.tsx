import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE } from "@/lib/guides/strange-festival-animated-movies.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.slug}`;
const DESCRIPTION =
  STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.metaDescription ??
  STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.documentTitle ?? STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function StrangeFestivalAnimatedMoviesGuidePage() {
  return (
    <GuideDocumentPage
      guide={STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
