import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { TOMM_MOORE_MOVIES_GUIDE } from "@/lib/guides/tomm-moore-movies.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${TOMM_MOORE_MOVIES_GUIDE.slug}`;
const DESCRIPTION =
  TOMM_MOORE_MOVIES_GUIDE.metaDescription ?? TOMM_MOORE_MOVIES_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: TOMM_MOORE_MOVIES_GUIDE,
    path: PATH,
    description: DESCRIPTION,
    titleH1:
      TOMM_MOORE_MOVIES_GUIDE.documentTitle ?? TOMM_MOORE_MOVIES_GUIDE.h1,
  });
}

export default function TommMooreMoviesGuidePage() {
  return (
    <GuideDocumentPage
      guide={TOMM_MOORE_MOVIES_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
