import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE } from "@/lib/guides/strange-festival-animated-movies.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.slug}`;
const DESCRIPTION =
  STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.metaDescription ??
  STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1:
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.documentTitle ??
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default function StrangeFestivalAnimatedMoviesGuidePage() {
  return (
    <GuideDocumentPage
      guide={STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
