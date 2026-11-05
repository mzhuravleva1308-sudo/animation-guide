import FilmsPageClient from "@/components/FilmsPageClient";
import { PUBLIC_CATALOG_PAGE_SIZE } from "@/lib/load-public-film-catalog";

/**
 * Outer route fallback before auth resolves. Guest chrome + real
 * search/filters; Suspense then upgrades Saved/Watched once auth is known.
 */
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
