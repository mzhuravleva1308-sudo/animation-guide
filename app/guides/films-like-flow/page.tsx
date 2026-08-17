import type { Metadata } from "next";
import GuidePageClient from "@/components/guides/GuidePageClient";
import { FILMS_LIKE_FLOW_GUIDE } from "@/lib/guides/films-like-flow.mjs";
import { loadGuidePage } from "@/lib/load-guide-page";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TITLE = "9 Animated Films Like Flow | Resonale";
const DESCRIPTION =
  "If you loved Flow, these nine animated films share its wordless storytelling, emotional animal characters, and strange, beautiful worlds.";
const PATH = "/guides/films-like-flow";

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadGuidePage(FILMS_LIKE_FLOW_GUIDE);
  const indexable = !page.loadError && page.missingTitles.length === 0;

  return {
    metadataBase: new URL(PUBLIC_SITE_ORIGIN),
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
      canonical: PATH,
    },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: PATH,
      siteName: "Resonale",
      type: "website",
    },
    robots: {
      index: indexable,
      follow: true,
    },
  };
}

export default async function FilmsLikeFlowGuidePage() {
  const page = await loadGuidePage(FILMS_LIKE_FLOW_GUIDE);

  return (
    <GuidePageClient
      auth={page.auth}
      groups={page.groups}
      missingTitles={page.missingTitles}
      loadError={page.loadError}
      content={FILMS_LIKE_FLOW_GUIDE}
      postAuthPath={PATH}
      anchorFilm={page.anchorFilm}
      initialFilmRatings={page.initialFilmRatings}
      initialSavedFilmIds={page.initialSavedFilmIds}
      initialRatingUpdatedAtMs={page.initialRatingUpdatedAtMs}
      initialSavedAtMs={page.initialSavedAtMs}
    />
  );
}
