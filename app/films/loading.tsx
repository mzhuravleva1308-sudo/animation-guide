import FilmsCatalogPendingShell from "@/components/FilmsCatalogPendingShell";

/** /films redirects to /; keep loading chrome consistent if this flashes. */
export default function FilmsLoading() {
  return <FilmsCatalogPendingShell showSubtitle />;
}
