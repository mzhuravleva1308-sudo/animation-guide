import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { FILMS_LIKE_CORALINE_GUIDE } from "@/lib/guides/films-like-coraline.mjs";
import {
  buildGuideDocumentMetadata,
  resolveGuideShareImage,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${FILMS_LIKE_CORALINE_GUIDE.slug}`;
const DESCRIPTION =
  FILMS_LIKE_CORALINE_GUIDE.metaDescription ??
  FILMS_LIKE_CORALINE_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(FILMS_LIKE_CORALINE_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return buildGuideDocumentMetadata({
    h1: FILMS_LIKE_CORALINE_GUIDE.h1,
    description: DESCRIPTION,
    path: PATH,
    indexable,
    imageUrl: resolveGuideShareImage(page),
  });
}

export default function FilmsLikeCoralineGuidePage() {
  return (
    <GuideDocumentPage
      guide={FILMS_LIKE_CORALINE_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
