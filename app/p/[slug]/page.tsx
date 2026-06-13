import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Film } from "@/types/film";
import RatingButtons from "@/components/RatingButtons";
import WatchlistButton from "@/components/WatchlistButton";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";

function getRandomItems<T>(items: T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ filter?: string; token?: string; tags?: string }>;
}) {
  const routeParams = await params;
const queryParams = await searchParams;

const profileSlug = routeParams.slug;
const token = queryParams?.token;
const profileBasePath = `/p/${profileSlug}?token=${encodeURIComponent(token ?? "")}`;

const selectedTags = new Set(
  (queryParams?.tags ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
);

function getTagHref(tag: string) {
  const normalizedTag = tag.trim().toLowerCase();
  const nextTags = new Set(selectedTags);

  if (nextTags.has(normalizedTag)) {
    nextTags.delete(normalizedTag);
  } else {
    nextTags.add(normalizedTag);
  }

  const tagsParam = Array.from(nextTags)
    .sort()
    .map(encodeURIComponent)
    .join(",");

  return tagsParam
    ? `${profileBasePath}&filter=all&tags=${tagsParam}`
    : `${profileBasePath}&filter=all`;
}

const activeFilter =
  queryParams?.filter === "saved"
    ? "saved"
    : queryParams?.filter === "rated"
      ? "rated"
      : queryParams?.filter === "all"
        ? "all"
        : "top picks";

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, slug, taste_profile, taste_profile_updated_at")
    .eq("slug", profileSlug)
    .eq("share_token", token)
    .single();

  if (!profile) {
    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6">
          <h1 className="mb-2 text-2xl font-semibold text-gray-900">
            Profile not found
          </h1>
          <p className="text-sm text-gray-600">
            This profile is private or the link is invalid.
          </p>
        </div>
      </main>
    );
  }

  const { data: allFilmsData, error } = await supabase
    .from("films")
    .select("*")
    .order("created_at", { ascending: false });

  const allFilms = (allFilmsData as Film[] | null) ?? [];

  let ratedFilmIds = new Set<string>();
  let ratingByFilmId = new Map<string, number>();

  const { data: ratings } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profile.id);

  ratedFilmIds = new Set(ratings?.map((item) => item.film_id) ?? []);

  ratingByFilmId = new Map(
    ratings
      ?.filter((item) => item.rating !== null)
      .map((item) => [item.film_id, item.rating]) ?? []
  );

  const watchedFilms = allFilms.filter((film) => ratedFilmIds.has(film.id));

  const watchedTagCounts = watchedFilms.reduce<Record<string, number>>(
    (acc, film) => {
      const rating = ratingByFilmId.get(film.id) ?? 0;

      // Low-rated films should not define your taste.
      if (rating < 6) {
        return acc;
      }

      const weight = rating >= 8 ? 2 : 1;
      const tags = film.moods ?? [];

      tags.forEach((tag) => {
        const normalizedTag = tag.trim().toLowerCase();

        if (!normalizedTag) {
          return;
        }

        acc[normalizedTag] = (acc[normalizedTag] ?? 0) + weight;
      });

      return acc;
    },
    {}
  );

  const watchedTags = Object.entries(watchedTagCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([tag]) => tag);

    function getTasteMatchScore(film: Film) {
      const filmTags = (film.moods ?? []).map((tag) =>
        tag.trim().toLowerCase()
      );
    
      const baseScore = filmTags.reduce((score, tag) => {
        return score + (watchedTagCounts[tag] ?? 0);
      }, 0);
    
      const selectedTagMatches = filmTags.filter((tag) =>
        selectedTags.has(tag)
      ).length;
    
      const selectedTagsBonus = selectedTagMatches * 100;
    
      return baseScore + selectedTagsBonus;
    }

  function getStyleKey(film: Film) {
    return film.technique?.trim().toLowerCase() || "unknown";
  }

  function pickDiverseTopFilms(candidates: Film[], count: number) {
    const selectedFilms: Film[] = [];
    const usedStyles = new Set<string>();

    for (const film of candidates) {
      const styleKey = getStyleKey(film);

      if (!usedStyles.has(styleKey)) {
        selectedFilms.push(film);
        usedStyles.add(styleKey);
      }

      if (selectedFilms.length === count) {
        return selectedFilms;
      }
    }

    for (const film of candidates) {
      if (!selectedFilms.some((selectedFilm) => selectedFilm.id === film.id)) {
        selectedFilms.push(film);
      }

      if (selectedFilms.length === count) {
        return selectedFilms;
      }
    }

    return selectedFilms;
  }

  let films: Film[] = [];

  if (activeFilter === "all") {
    films = allFilms
      .filter((film) => !ratedFilmIds.has(film.id))
      .sort((a, b) => {
        const scoreDifference = getTasteMatchScore(b) - getTasteMatchScore(a);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return (b.year ?? 0) - (a.year ?? 0);
      });
  }

  if (activeFilter === "saved") {
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

  if (activeFilter === "rated") {
    films = allFilms.filter((film) => ratedFilmIds.has(film.id));
  }

  if (activeFilter === "top picks") {
    const { data: watchlistItems } = await supabase
      .from("profile_film_lists")
      .select("film_id")
      .eq("profile_id", profile.id)
      .eq("list_type", "to_watch");

    const savedFilmIds = new Set(
      watchlistItems?.map((item) => item.film_id) ?? []
    );

    const candidates = allFilms
      .filter((film) => !ratedFilmIds.has(film.id) && !savedFilmIds.has(film.id))
      .sort((a, b) => {
        const scoreDifference = getTasteMatchScore(b) - getTasteMatchScore(a);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return (b.year ?? 0) - (a.year ?? 0);
      });

    films = pickDiverseTopFilms(candidates, 3);
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">
            {profile.name}’s Animation Guide
          </h1>
          <p className="mt-2 text-gray-600">
            Find strange, beautiful, and emotionally resonant animated films to
            watch next.
          </p>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={profileBasePath}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            activeFilter === "top picks"
              ? "border-black bg-black text-white"
              : "border-gray-300 bg-white text-gray-700"
          }`}
        >
          Top picks
        </Link>

        <Link
          href={`${profileBasePath}&filter=saved`}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            activeFilter === "saved"
              ? "border-black bg-black text-white"
              : "border-gray-300 bg-white text-gray-700"
          }`}
        >
          Saved
        </Link>

        <Link
          href={`${profileBasePath}&filter=all`}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            activeFilter === "all"
              ? "border-black bg-black text-white"
              : "border-gray-300 bg-white text-gray-700"
          }`}
        >
          All films
        </Link>

        <Link
          href={`${profileBasePath}&filter=rated`}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            activeFilter === "rated"
              ? "border-black bg-black text-white"
              : "border-gray-300 bg-white text-gray-700"
          }`}
        >
          Watched
        </Link>
      </div>

      {activeFilter === "all" && (
        <p className="mb-6 text-sm text-gray-500">
          {films.length} films in the database
        </p>
      )}

      {activeFilter === "rated" && (
        <p className="mb-6 text-sm text-gray-500">
          Showing {watchedFilms.length} watched{" "}
          {watchedFilms.length === 1 ? "film" : "films"}
        </p>
      )}

      {activeFilter === "rated" && watchedFilms.length > 0 && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="mb-1 text-sm font-medium text-gray-500">
            What the system knows about you
          </p>

          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            {profile.name}’s taste profile
          </h2>

          <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-gray-700">
            {profile?.taste_profile ??
              "No AI taste profile yet. Generate one from your rated films."}
          </p>

          {profile?.taste_profile_updated_at && (
            <p className="mt-3 text-xs text-gray-400">
              Last updated:{" "}
              {new Date(profile.taste_profile_updated_at).toLocaleDateString()}
            </p>
          )}

            <UpdateTasteProfileButton profileSlug={profileSlug} token={token ?? ""} />  
        </section>
      )}

      {activeFilter === "all" && watchedTags.length > 0 && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-700">
            Choose moods to prioritize
          </p>

          <div className="flex flex-wrap gap-2">
  {watchedTags.map((tag) => {
    const isSelected = selectedTags.has(tag);

    return (
      <Link
        key={tag}
        href={getTagHref(tag)}
        className={`rounded-full border px-3 py-1 text-sm transition ${
          isSelected
            ? "border-black bg-black text-white"
            : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
        }`}
      >
        {tag}
      </Link>
    );
  })}
</div>

{selectedTags.size > 0 && (
  <Link
    href={`${profileBasePath}&filter=all`}
    className="mt-3 inline-block text-sm text-gray-500 underline"
  >
    Clear selected tags
  </Link>
)}
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error.message}
        </div>
      )}

      {!films?.length && !error && (
        <div className="rounded-2xl border border-dashed p-8 text-gray-500">
          {activeFilter === "top picks"
            ? "No top picks left. Try All films or clear some ratings."
            : activeFilter === "saved"
              ? "No saved films yet."
              : activeFilter === "rated"
                ? "No watched films yet."
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
                      film.duration_minutes
                        ? `${film.duration_minutes} min`
                        : null,
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

              {film.synopsis && (
                <p className="mt-4 text-gray-700">{film.synopsis}</p>
              )}

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
                <RatingButtons filmId={film.id} profileSlug={profileSlug} />
                <WatchlistButton filmId={film.id} profileSlug={profileSlug} />
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
