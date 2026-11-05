import FilmsPageClient from "@/components/FilmsPageClient";
import { PUBLIC_CATALOG_PAGE_SIZE } from "@/lib/load-public-film-catalog";

/** /films redirects to /; keep loading chrome consistent if this flashes. */
export default function FilmsLoading() {
  return (
    <FilmsPageClient
      auth={null}
      films={[]}
      awardWinningFilmIds={[]}
      pageSize={PUBLIC_CATALOG_PAGE_SIZE}
      loadError={null}
      catalogPending
      showSubtitle
    />
  );
}
