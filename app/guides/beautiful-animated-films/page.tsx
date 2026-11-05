import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "@/lib/guides/beautiful-animated-films.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug}`;
const DESCRIPTION =
  BEAUTIFUL_ANIMATED_FILMS_GUIDE.metaDescription ??
  BEAUTIFUL_ANIMATED_FILMS_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(BEAUTIFUL_ANIMATED_FILMS_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1: BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default function BeautifulAnimatedFilmsGuidePage() {
  return (
    <GuideDocumentPage
      guide={BEAUTIFUL_ANIMATED_FILMS_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
