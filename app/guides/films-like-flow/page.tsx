import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { FILMS_LIKE_FLOW_GUIDE } from "@/lib/guides/films-like-flow.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`;
const DESCRIPTION =
  FILMS_LIKE_FLOW_GUIDE.metaDescription ?? FILMS_LIKE_FLOW_GUIDE.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: FILMS_LIKE_FLOW_GUIDE.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function FilmsLikeFlowGuidePage() {
  return (
    <GuideDocumentPage
      guide={FILMS_LIKE_FLOW_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
