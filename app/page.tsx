import FilmsPageClient from "@/components/FilmsPageClient";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HomePageProps = {
  searchParams: Promise<{
    media?: string;
    sort?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  // Stage timings (incl. totalMs ≈ server page work) are logged from
  // loadPublicFilmCatalog in development via [catalog] load.
  // Public films/badges are cached inside the loader; this page stays dynamic
  // because auth + personalized order are request-specific.
  // Live-action tab/params are allowlisted inside the loader.
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
      mediaType={catalog.mediaType}
      sortParam={catalog.sortParam}
      showLiveActionTab={catalog.showLiveActionTab}
      postAuthPath="/"
      showSubtitle
    />
  );
}
