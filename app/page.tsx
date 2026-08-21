import type { Metadata } from "next";
import FilmsPageClient from "@/components/FilmsPageClient";
import { parseCatalogQuickFilter } from "@/lib/catalog-url";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HomePageProps = {
  searchParams: Promise<{
    media?: string;
    sort?: string;
    filter?: string;
  }>;
};

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  alternates: {
    canonical: PUBLIC_SITE_ORIGIN,
  },
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  // Stage timings (incl. totalMs ≈ server page work) are logged from
  // loadPublicFilmCatalog in development via [catalog] load.
  // Public films/badges are cached inside the loader; this page stays dynamic
  // because auth + personalized order are request-specific.
  // Live-action Films catalog is available to all viewers.
  const catalog = await loadPublicFilmCatalog({
    media: params.media,
    sort: params.sort,
  });

  return (
    <FilmsPageClient
      auth={catalog.auth}
      films={catalog.films}
      awardWinningFilmIds={catalog.awardWinningFilmIds}
      pageSize={catalog.pageSize}
      loadError={catalog.loadError}
      initialFilmRatings={catalog.initialFilmRatings}
      initialSavedFilmIds={catalog.initialSavedFilmIds}
      initialRatingUpdatedAtMs={catalog.initialRatingUpdatedAtMs}
      initialSavedAtMs={catalog.initialSavedAtMs}
      scoresLastComputedAt={catalog.scoresLastComputedAt}
      mediaType={catalog.mediaType}
      sortParam={catalog.sortParam}
      showLiveActionTab={catalog.showLiveActionTab}
      initialQuickFilter={parseCatalogQuickFilter(
        params.filter,
        catalog.mediaType
      )}
      showSubtitle
    />
  );
}
