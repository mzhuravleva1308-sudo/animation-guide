import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "@/lib/guides/beautiful-animated-films.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug}`;
const DESCRIPTION =
  BEAUTIFUL_ANIMATED_FILMS_GUIDE.metaDescription ??
  BEAUTIFUL_ANIMATED_FILMS_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: BEAUTIFUL_ANIMATED_FILMS_GUIDE,
    path: PATH,
    description: DESCRIPTION,
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
