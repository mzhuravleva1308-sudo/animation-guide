import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { FILMS_LIKE_CORALINE_GUIDE } from "@/lib/guides/films-like-coraline.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${FILMS_LIKE_CORALINE_GUIDE.slug}`;
const DESCRIPTION =
  FILMS_LIKE_CORALINE_GUIDE.metaDescription ??
  FILMS_LIKE_CORALINE_GUIDE.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: FILMS_LIKE_CORALINE_GUIDE.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function FilmsLikeCoralineGuidePage() {
  return (
    <GuideDocumentPage
      guide={FILMS_LIKE_CORALINE_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
