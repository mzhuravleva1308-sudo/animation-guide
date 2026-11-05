import FilmsCatalogPendingShell from "@/components/FilmsCatalogPendingShell";

/**
 * Outer route fallback before the page shell resolves auth.
 * Guest chrome is fine here — Suspense fallback upgrades Saved/Watched once
 * auth is known, then cards stream in.
 */
export default function FilmsLoading() {
  return <FilmsCatalogPendingShell showSubtitle />;
}
