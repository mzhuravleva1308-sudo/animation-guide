import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ANIMATION_STYLES_GUIDE } from "@/lib/guides/animation-styles.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${ANIMATION_STYLES_GUIDE.slug}`;
const DESCRIPTION =
  ANIMATION_STYLES_GUIDE.metaDescription ?? ANIMATION_STYLES_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(ANIMATION_STYLES_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1: ANIMATION_STYLES_GUIDE.documentTitle ?? ANIMATION_STYLES_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default function AnimationStylesGuidePage() {
  return (
    <GuideDocumentPage
      guide={ANIMATION_STYLES_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
