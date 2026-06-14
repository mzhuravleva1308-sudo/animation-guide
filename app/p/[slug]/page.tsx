import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  buildBalancedScores,
  FilmScore,
  RawFilmScore,
  sortFilmsByScore,
} from "@/lib/profile-film-scoring";
import { Film } from "@/types/film";
import RatingButtons from "@/components/RatingButtons";
import WatchlistButton from "@/components/WatchlistButton";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";

type ProfileTasteCore = {
  id: string;
  core_index: number;
  core_type: string | null;
  name: string | null;
  strength: number;
  coverage: number | null;
  maturity: string | null;
  nearest_moods: string[] | null;
  emotional_profile_tags?: string[] | null;
  aesthetic_profile_tags?: string[] | null;
};

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    filter?: string;
    token?: string;
    tags?: string;
    page?: string;
  }>;
}) {
  const routeParams = await params;
  const queryParams = await searchParams;

  const profileSlug = routeParams.slug;
  const token = queryParams?.token;
  const profileBasePath = `/p/${profileSlug}?token=${encodeURIComponent(token ?? "")}`;
  const allFilmsPageSize = 50;

  const parsedPage = Number.parseInt(queryParams?.page ?? "1", 10);
  const currentPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  function buildAllFilmsPageUrl(page: number) {
    return `${profileBasePath}&filter=all&page=${page}`;
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

  const { data: tasteCoresData } = await supabase
    .from("profile_taste_cores")
    .select(
      "id, core_index, core_type, name, strength, coverage, maturity, nearest_moods, emotional_profile_tags, aesthetic_profile_tags"
    )
    .eq("profile_id", profile.id)
    .order("core_index");

  const tasteCores = (tasteCoresData as ProfileTasteCore[] | null) ?? [];

  const { data: allFilmsData, error } = await supabase
    .from("films")
    .select("*")
    .order("created_at", { ascending: false });

  const allFilms = (allFilmsData as Film[] | null) ?? [];

  const { data: ratings } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profile.id);

  const ratedFilmIds = new Set(ratings?.map((item) => item.film_id) ?? []);

  const watchedFilms = allFilms.filter((film) => ratedFilmIds.has(film.id));

  function getCoreProfileTags(core: ProfileTasteCore) {
    if (core.core_type === "emotional") {
      return core.emotional_profile_tags ?? core.nearest_moods ?? [];
    }

    if (core.core_type === "aesthetic") {
      return core.aesthetic_profile_tags ?? core.nearest_moods ?? [];
    }

    return core.nearest_moods ?? [];
  }

  let films: Film[] = [];

  if (activeFilter === "all") {
    films = allFilms.filter((film) => !ratedFilmIds.has(film.id));
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

    films = allFilms.filter(
      (film) => !ratedFilmIds.has(film.id) && !savedFilmIds.has(film.id)
    );
  }

  const needsRecommendationScoring =
    activeFilter === "top picks" || activeFilter === "all";

  const filmScoresById = new Map<string, FilmScore>();
  let totalAllFilmsCount = 0;
  let allFilmsCurrentPage = currentPage;
  let allFilmsTotalPages = 1;

  function getFilmScore(filmId: string) {
    return filmScoresById.get(filmId) ?? null;
  }

  if (needsRecommendationScoring) {
    const { data: scoreRows } = await supabase
      .from("profile_film_scores")
      .select("film_id, emotional_score, material_score")
      .eq("profile_id", profile.id);

    const rawScoresByFilmId = new Map<string, RawFilmScore>(
      (scoreRows ?? []).map((row) => [
        row.film_id,
        {
          emotional: Number(row.emotional_score ?? 0),
          material: Number(row.material_score ?? 0),
        },
      ])
    );

    const balancedScores = buildBalancedScores(films, rawScoresByFilmId);

    balancedScores.forEach((score, filmId) => {
      filmScoresById.set(filmId, score);
    });

    films = sortFilmsByScore(films, filmScoresById);

    if (activeFilter === "top picks") {
      films = films.slice(0, 3);
    }

    if (activeFilter === "all") {
      totalAllFilmsCount = films.length;
      allFilmsTotalPages = Math.max(
        1,
        Math.ceil(totalAllFilmsCount / allFilmsPageSize)
      );
      allFilmsCurrentPage = Math.min(currentPage, allFilmsTotalPages);

      const start = (allFilmsCurrentPage - 1) * allFilmsPageSize;
      const end = start + allFilmsPageSize;

      films = films.slice(start, end);
    }
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
          className={`rounded-full border px-4 py-2 text-sm font-medium ${activeFilter === "top picks"
            ? "border-black bg-black text-white"
            : "border-gray-300 bg-white text-gray-700"
            }`}
        >
          Top picks
        </Link>

        <Link
          href={`${profileBasePath}&filter=saved`}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${activeFilter === "saved"
            ? "border-black bg-black text-white"
            : "border-gray-300 bg-white text-gray-700"
            }`}
        >
          Saved
        </Link>

        <Link
          href={`${profileBasePath}&filter=all`}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${activeFilter === "all"
            ? "border-black bg-black text-white"
            : "border-gray-300 bg-white text-gray-700"
            }`}
        >
          All films
        </Link>

        <Link
          href={`${profileBasePath}&filter=rated`}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${activeFilter === "rated"
            ? "border-black bg-black text-white"
            : "border-gray-300 bg-white text-gray-700"
            }`}
        >
          Watched
        </Link>


      </div>

      {activeFilter === "all" && totalAllFilmsCount > 0 && (
        <p className="mb-6 text-sm text-gray-500">
          {totalAllFilmsCount} films in the guide
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

      {activeFilter === "all" && tasteCores.length > 0 && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-4 text-sm font-medium text-gray-700">
            Taste cores detected from your ratings
          </p>

          <div className="space-y-4">
            {[...tasteCores]
              .sort((a, b) => {
                const order = { emotional: 0, aesthetic: 1 };

                return (
                  (order[a.core_type as "emotional" | "aesthetic"] ?? 99) -
                  (order[b.core_type as "emotional" | "aesthetic"] ?? 99)
                );
              })
              .map((core) => {
                const coreProfileTags = getCoreProfileTags(core);

                return (
                  <div key={`${core.core_type}-${core.core_index}`}>
                    {coreProfileTags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {coreProfileTags.slice(0, 10).map((tag) => (
                          <span
                            key={tag}
                            className={`rounded-full border px-3 py-1 text-sm ${
                              core.core_type === "aesthetic"
                                ? "border-stone-200 bg-stone-100 text-stone-700"
                                : "border-gray-200 bg-gray-50 text-gray-600"
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
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
        {films?.map((film) => {
          const score = getFilmScore(film.id);

          return (
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
                    {score && (
                      <div className="mt-2 space-y-0.5 text-xs text-gray-400">
                        <p>Raw emotional: {score.emotional.toFixed(4)}</p>
                        <p>Raw material: {score.material.toFixed(4)}</p>
                        <p>Balanced total: {score.balanced.toFixed(4)}</p>
                      </div>
                    )}
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

                <div className="mt-4 space-y-3">
                  {film.moods?.length ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {film.moods.map((mood) => (
                          <span
                            key={mood}
                            className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                          >
                            {mood}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {film.aesthetic_tags?.length ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {film.aesthetic_tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-stone-100 px-3 py-1 text-sm text-gray-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {film.narrative_tags?.length ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {film.narrative_tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {film.technique && (
                    <div>
                      <span className="inline-flex rounded-full bg-gray-50 px-3 py-1 text-sm text-gray-500">
                        {film.technique}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-end justify-between gap-6 pt-4">
                  <RatingButtons filmId={film.id} profileSlug={profileSlug} />
                  <WatchlistButton filmId={film.id} profileSlug={profileSlug} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {activeFilter === "all" && totalAllFilmsCount > 0 && (
        <nav
          aria-label="All films pagination"
          className="mt-8 flex items-center justify-center gap-4"
        >
          {allFilmsCurrentPage > 1 ? (
            <Link
              href={buildAllFilmsPageUrl(allFilmsCurrentPage - 1)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400">
              Previous
            </span>
          )}

          <span className="text-sm text-gray-600">
            Page {allFilmsCurrentPage} of {allFilmsTotalPages}
          </span>

          {allFilmsCurrentPage < allFilmsTotalPages ? (
            <Link
              href={buildAllFilmsPageUrl(allFilmsCurrentPage + 1)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400">
              Next
            </span>
          )}
        </nav>
      )}
    </main>
  );
}
