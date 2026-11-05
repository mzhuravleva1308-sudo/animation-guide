import FilmsCatalogPendingShell from "@/components/FilmsCatalogPendingShell";

/**
 * Outer route fallback before auth resolves. Guest chrome + real
 * search/filters; Suspense then upgrades Saved/Watched once auth is known.
 * Distinct from FilmsPageClient so soft nav can remount the ready catalog.
 */
export default function FilmsLoading() {
  return <FilmsCatalogPendingShell showSubtitle />;
}
