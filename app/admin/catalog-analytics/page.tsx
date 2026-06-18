import Link from "next/link";
import { CatalogAnalyticsDashboard } from "@/components/CatalogAnalyticsDashboard";
import { analyzeFilmCatalog } from "@/lib/catalog-analytics.mjs";
import { CATALOG_ANALYTICS_FILM_FIELDS } from "@/lib/load-films-catalog.mjs";
import { supabase } from "@/lib/supabase";
import { Film } from "@/types/film";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CatalogAnalyticsPage() {
  const { data, error } = await supabase
    .from("films")
    .select(CATALOG_ANALYTICS_FILM_FIELDS)
    .order("id");

  if (error) {
    throw error;
  }

  const films = (data ?? []) as unknown as Film[];
  const analytics = analyzeFilmCatalog(films);

  return (
    <main className="mx-auto max-w-6xl p-8">
      <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-black">
        ← Back to library
      </Link>

      <h1 className="text-3xl font-semibold">Catalog analytics</h1>
      <p className="mt-2 text-gray-600">
        Coverage and metadata health for the curated film database.
      </p>

      <div className="mt-8">
        <CatalogAnalyticsDashboard analytics={analytics} />
      </div>
    </main>
  );
}
