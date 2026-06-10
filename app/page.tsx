import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Film } from "@/types/film";
import RatingButtons from "@/components/RatingButtons";
import WatchlistButton from "@/components/WatchlistButton";

type HomePageProps = {
  searchParams?: Promise<{
    filter?: string;
  }>;
};

function getRandomItems<T>(items: T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const activeFilter =
    params?.filter === "saved"
      ? "saved"
      : params?.filter === "all"
        ? "all"
        : "recommended";

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", "maria")
    .single();

  const { data: allFilmsData, error } = await supabase
    .from("films")
    .select("*")
    .order("created_at", { ascending: false });

  const allFilms = (allFilmsData as Film[] | null) ?? [];

  let films: Film[] = [];

  if (activeFilter === "all") {
    films = allFilms;
  }

  if (activeFilter === "saved" && profile) {
    const { data: watchlistItems } = await supabase
      .from("profile_film_lists")
      .select("film_id")
      .eq("profile_id", profile.id)
      .eq("list_type", "to_watch");

    const savedFilmIds = new Set(
      watchlistItems?.map((item) => item.film_id) ?? []
    );

    films = allFilms.filter((film) => savedFilmIds.has(film.id));
  }

  if (activeFilter === "recommended" && profile) {
    const { data: ratings } = await supabase
      .from("film_ratings")
      .select("film_id")
      .eq("profile_id", profile.id);

    const { data: watchlistItems } = await supabase
      .from("profile_film_lists")
      .select("film_id")
      .eq("profile_id", profile.id)
      .eq("list_type", "to_watch");

    const ratedFilmIds = new Set(ratings?.map((item) => item.film_id) ?? []);
    const savedFilmIds = new Set(
      watchlistItems?.map((item) => item.film_id) ?? []
    );

    const candidates = allFilms.filter(
      (film) => !ratedFilmIds.has(film.id) && !savedFilmIds.has(film.id)
    );

    films = getRandomItems(candidates, 3);
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">Animation Taste Guide</h1>
          <p className="mt-2 text-gray-600">
            A personal library for independent animated shorts.
          </p>
        </div>

        <div className="flex gap-3">


</div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
  <Link
    href="/"
    className={`rounded-full border px-4 py-2 text-sm font-medium ${
      activeFilter === "recommended"
        ? "border-black bg-black text-white"
        : "border-gray-300 bg-white text-gray-700"
    }`}
  >
    Recommended
  </Link>

  <Link
    href="/?filter=saved"
    className={`rounded-full border px-4 py-2 text-sm font-medium ${
      activeFilter === "saved"
        ? "border-black bg-black text-white"
        : "border-gray-300 bg-white text-gray-700"
    }`}
  >
    Saved
  </Link>

  <Link
    href="/?filter=all"
    className={`rounded-full border px-4 py-2 text-sm font-medium ${
      activeFilter === "all"
        ? "border-black bg-black text-white"
        : "border-gray-300 bg-white text-gray-700"
    }`}
  >
    All films
  </Link>
</div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error.message}
        </div>
      )}

{!films?.length && !error && (
  <div className="rounded-2xl border border-dashed p-8 text-gray-500">
    {activeFilter === "recommended"
      ? "No recommendations left. Try All films or clear some ratings."
      : activeFilter === "saved"
        ? "No saved films yet."
        : "No films yet. Add your first one."}
  </div>
)}

      <section className="grid gap-4">
        {films?.map((film) => (
          <article
          key={film.id}
          className="grid gap-5 rounded-2xl border p-5 md:grid-cols-[160px_1fr]"
        >
          <div className="relative h-56 w-full overflow-hidden rounded-xl bg-gray-100 md:h-60">
  {film.image_url ? (
    <img
      src={film.image_url}
      alt={film.title}
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      No image
    </div>
  )}

  {film.trailer_url && (
    <a
      href={film.trailer_url}
      target="_blank"
      rel="noreferrer"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-black shadow-sm backdrop-blur hover:bg-white"
    >
      ▶ Trailer
    </a>
  )}
</div>
        
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-medium">{film.title}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {[
                    film.director,
                    film.year,
                    film.country,
                    film.duration_minutes ? `${film.duration_minutes} min` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
        
              {film.availability && film.availability !== "unknown" && (
                 <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                  {film.availability}
                 </span>
              )}
            </div>
        
            {film.synopsis && <p className="mt-4 text-gray-700">{film.synopsis}</p>}
        
            {film.why_i_might_like_it && (
              <p className="mt-4 rounded-xl bg-gray-50 p-4 text-gray-700">
                <span className="font-medium"></span>
                {film.why_i_might_like_it}
              </p>
            )}
        
            <div className="mt-4 flex flex-wrap gap-2">
              {film.moods?.map((mood) => (
                <span
                  key={mood}
                  className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                >
                  {mood}
                </span>
              ))}
        
              {film.technique && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                  {film.technique}
                </span>
              )}
            </div>
            <div className="mt-auto flex items-end justify-between gap-6 pt-4">
             <RatingButtons filmId={film.id} profileSlug="maria" />
            <WatchlistButton filmId={film.id} profileSlug="maria" />
            </div>
          </div>
          
        </article>
        ))}
      </section>
    </main>
  );
}