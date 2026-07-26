import FilmsPageClient from "@/components/FilmsPageClient";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FilmsPage() {
  const catalog = await loadPublicFilmCatalog();

  return (
    <FilmsPageClient
      auth={catalog.auth}
      films={catalog.films}
      awardWinningFilmIds={catalog.awardWinningFilmIds}
      pageSize={catalog.pageSize}
      loadError={catalog.loadError}
      postAuthPath="/films"
      showSubtitle
    />
  );
}
