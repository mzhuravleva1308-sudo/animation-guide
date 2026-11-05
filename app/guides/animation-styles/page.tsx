import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ANIMATION_STYLES_GUIDE } from "@/lib/guides/animation-styles.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${ANIMATION_STYLES_GUIDE.slug}`;
const DESCRIPTION =
  ANIMATION_STYLES_GUIDE.metaDescription ?? ANIMATION_STYLES_GUIDE.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: ANIMATION_STYLES_GUIDE.documentTitle ?? ANIMATION_STYLES_GUIDE.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function AnimationStylesGuidePage() {
  return (
    <GuideDocumentPage
      guide={ANIMATION_STYLES_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
