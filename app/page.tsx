import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Film } from "@/types/film";
import RatingButtons from "@/components/RatingButtons";

export default async function HomePage() {
  const { data, error } = await supabase
    .from("films")
    .select("*")
    .order("created_at", { ascending: false });

  const films = data as Film[] | null;

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

  <Link

    href="/admin/import"

    className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"

  >

    Import film

  </Link>

  <Link

    href="/admin/new"

    className="rounded-xl border px-4 py-2 text-sm font-medium"

  >

    Add manually

  </Link>

</div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error.message}
        </div>
      )}

      {!films?.length && !error && (
        <div className="rounded-2xl border border-dashed p-8 text-gray-500">
          No films yet. Add your first one.
        </div>
      )}

      <section className="grid gap-4">
        {films?.map((film) => (
          <article
          key={film.id}
          className="grid gap-5 rounded-2xl border p-5 md:grid-cols-[160px_1fr]"
        >
          {film.image_url ? (
            <img
              src={film.image_url}
              alt={film.title}
              className="h-56 w-full rounded-xl object-cover md:h-60"
            />
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400 md:h-60">
              No image
            </div>
          )}
        
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
            <div className="mt-auto pt-4">
           <RatingButtons filmId={film.id} profileSlug="maria" />
          </div>
          </div>
          
        </article>
        ))}
      </section>
    </main>
  );
}