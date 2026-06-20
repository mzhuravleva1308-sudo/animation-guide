import FilmsAuthControl from "@/components/FilmsAuthControl";
import FilmCatalog from "@/components/FilmCatalog";
import { getAuthUserSummary } from "@/lib/auth/session";
import { normalizeFilms } from "@/lib/normalize-film";
import { sortFilmsByColdStart } from "@/lib/profile-film-scoring";
import { supabase } from "@/lib/supabase";
import { Film } from "@/types/film";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CATALOG_PAGE_SIZE = 50;

const PUBLIC_CATALOG_FILM_FIELDS = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "poster_url",
  "image_url",
  "external_image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "technique",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
  "cold_start_score",
].join(", ");

export default async function FilmsPage() {
  const [auth, { data: filmsData, error }] = await Promise.all([
    getAuthUserSummary(),
    supabase.from("films").select(PUBLIC_CATALOG_FILM_FIELDS),
  ]);

  const films = sortFilmsByColdStart(
    normalizeFilms((filmsData as Film[] | null) ?? [])
  );
  const loadError = error?.message ?? null;

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl p-8">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold">Animation Guide</h1>
            <p className="mt-2 text-gray-600">
              Find strange, beautiful, and emotionally resonant animated films to
              watch next.
            </p>
          </div>
          <FilmsAuthControl auth={auth} />
        </div>
      </header>

      <FilmCatalog
        films={films}
        pageSize={CATALOG_PAGE_SIZE}
        loadError={loadError}
      />
    </main>
  );
}
