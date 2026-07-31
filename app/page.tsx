import FilmsPageClient from "@/components/FilmsPageClient";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  // Stage timings (incl. totalMs ≈ server page work) are logged from
  // loadPublicFilmCatalog in development via [catalog] load.
  // Public films/badges are cached inside the loader; this page stays dynamic
  // because auth + personalized order are request-specific.
  const catalog = await loadPublicFilmCatalog();

  return (
    <FilmsPageClient
      auth={catalog.auth}
      films={catalog.films}
      awardWinningFilmIds={catalog.awardWinningFilmIds}
      pageSize={catalog.pageSize}
      loadError={catalog.loadError}
      initialFilmRatings={catalog.initialFilmRatings}
      initialSavedFilmIds={catalog.initialSavedFilmIds}
      postAuthPath="/"
      showSubtitle
    />
  );
}
