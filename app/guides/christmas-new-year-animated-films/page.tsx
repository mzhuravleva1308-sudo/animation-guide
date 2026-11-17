import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE } from "@/lib/guides/christmas-new-year-animated-films.mjs";
import { buildGuideRouteMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.slug}`;
const DESCRIPTION =
  CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.metaDescription ??
  CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.intro[0];

export async function generateMetadata(): Promise<Metadata> {
  return buildGuideRouteMetadata({
    guide: CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE,
    path: PATH,
    description: DESCRIPTION,
  });
}

export default function ChristmasNewYearAnimatedFilmsGuidePage() {
  return (
    <GuideDocumentPage
      guide={CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
