import CatalogRouteLoading from "@/components/CatalogRouteLoading";

/** /films redirects to /; keep loading chrome consistent if this flashes. */
export default function FilmsLoading() {
  return <CatalogRouteLoading />;
}
