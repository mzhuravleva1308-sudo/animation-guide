import Link from "next/link";
import { supabase } from "@/lib/supabase";
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
  center_embedding: number[] | string | null;
  emotional_profile_tags?: string[] | null;
  aesthetic_profile_tags?: string[] | null;
};

type FilmMoodEmbedding = {
  film_id: string;
  embedding: number[] | string | null;
};

type FilmAestheticEmbedding = {
  film_id: string;
  embedding: number[] | string | null;
};

type FilmScore = {
  emotional: number;
  material: number;
  balanced: number;
};

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

  function parseEmbedding(value: number[] | string | null | undefined) {
    if (!value) return null;

    if (Array.isArray(value)) {
      return value.map(Number);
    }

    if (typeof value === "string") {
      return value
        .replace("[", "")
        .replace("]", "")
        .split(",")
        .map((item) => Number(item.trim()));
    }

    return null;
  }

  function cosineSimilarity(a: number[], b: number[]) {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  function getCoreMatchScore(
    filmEmbedding: number[] | null | undefined,
    cores: Array<ProfileTasteCore & { centerEmbedding: number[] }>
  ) {
    if (!filmEmbedding || cores.length === 0) {
      return 0;
    }

    const coreScores = cores.map((core) => {
      const similarity = cosineSimilarity(filmEmbedding, core.centerEmbedding);

      const strength = Number(core.strength ?? 1);
      const coverage = Number(core.coverage ?? 1);
      const maturityBonus = core.maturity === "stable" ? 1 : 0.92;

      return similarity * strength * (0.7 + coverage * 0.3) * maturityBonus;
    });

    const coreScore = Math.max(...coreScores);

    return Math.pow(coreScore, 8);
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
    .select("*")
    .eq("profile_id", profile.id)
    .order("core_index");

  const tasteCores = ((tasteCoresData as ProfileTasteCore[] | null) ?? [])
    .map((core) => ({
      ...core,
      centerEmbedding: parseEmbedding(core.center_embedding),
    }))
    .filter(
      (core): core is ProfileTasteCore & { centerEmbedding: number[] } =>
        core.centerEmbedding !== null
    );

  const emotionalCores = tasteCores.filter(
    (core) => core.core_type === "emotional"
  );

  const aestheticCores = tasteCores.filter(
    (core) => core.core_type === "aesthetic"
  );

  const emotionalProfileTags = emotionalCores
    .flatMap((core) => core.emotional_profile_tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const emotionalProfileTagWeights = new Map(
    emotionalProfileTags.map((tag, index) => [
      tag,
      Math.max(0.55, 1 - index * 0.05),
    ])
  );

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

  const ratingByFilmId = new Map(
    ratings
      ?.filter((item) => item.rating !== null)
      .map((item) => [item.film_id, item.rating]) ?? []
  );

  const ratedFilms = allFilms
    .map((film) => ({
      ...film,
      rating: ratingByFilmId.get(film.id) ?? null,
    }))
    .filter((film) => Number(film.rating ?? 0) >= 7);

  const watchedFilms = allFilms.filter((film) => ratedFilmIds.has(film.id));

  function getRatingWeight(rating: number) {
    if (rating >= 10) return 1;
    if (rating >= 9) return 0.9;
    if (rating >= 8) return 0.8;
    if (rating >= 7) return 0.55;

    return 0;
  }

  function getEffectiveSimilarity(similarity: number) {
    const minSimilarity = 0.72;

    if (similarity <= minSimilarity) {
      return 0;
    }

    return (similarity - minSimilarity) / (1 - minSimilarity);
  }

  function getCentralityWeight(
    ratedFilm: Film,
    ratedFilmsForCentrality: Film[],
    embeddingByFilmId: Map<string, number[] | null>
  ) {
    const ratedEmbedding = embeddingByFilmId.get(ratedFilm.id);

    if (!ratedEmbedding) {
      return 0.55;
    }

    const neighborSignals = ratedFilmsForCentrality
      .filter((otherFilm) => otherFilm.id !== ratedFilm.id)
      .map((otherFilm) => {
        const otherEmbedding = embeddingByFilmId.get(otherFilm.id);

        if (!otherEmbedding) {
          return 0;
        }

        const similarity = cosineSimilarity(ratedEmbedding, otherEmbedding);

        return getEffectiveSimilarity(similarity);
      })
      .filter((signal) => signal > 0)
      .sort((a, b) => b - a)
      .slice(0, 3);

    if (neighborSignals.length === 0) {
      return 0.55;
    }

    const densityScore =
      neighborSignals.reduce((sum, signal) => sum + signal, 0) /
      neighborSignals.length;

    return 0.55 + densityScore * 0.45;
  }

  function normalizeMatchScore(
    score: number,
    range: { min: number; max: number }
  ) {
    const normalized = (score - range.min) / (range.max - range.min);

    return Math.max(0, Math.min(1, normalized));
  }

  function getScoreRange(scores: number[]) {
    const sortedScores = scores
      .filter((score) => Number.isFinite(score))
      .sort((a, b) => a - b);

    if (sortedScores.length === 0) {
      return { min: 0, max: 1 };
    }

    const min = sortedScores[0] ?? 0;
    const max = sortedScores[sortedScores.length - 1] ?? 1;

    if (max <= min) {
      return { min: 0, max: 1 };
    }

    return { min, max };
  }

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

  function getFilmScore(filmId: string) {
    return filmScoresById.get(filmId) ?? null;
  }

  if (needsRecommendationScoring) {
    const filmIds = allFilms.map((film) => film.id);

    const { data: filmMoodEmbeddingsData } = filmIds.length
      ? await supabase
          .from("film_mood_embeddings")
          .select("film_id, embedding")
          .in("film_id", filmIds)
      : { data: [] };

    const { data: filmAestheticEmbeddingsData } = filmIds.length
      ? await supabase
          .from("film_aesthetic_embeddings")
          .select("film_id, embedding")
          .in("film_id", filmIds)
      : { data: [] };

    const filmMoodEmbeddingByFilmId = new Map(
      ((filmMoodEmbeddingsData as FilmMoodEmbedding[] | null) ?? [])
        .map((row) => [row.film_id, parseEmbedding(row.embedding)] as const)
        .filter(([, embedding]) => embedding)
    );

    const filmAestheticEmbeddingByFilmId = new Map(
      ((filmAestheticEmbeddingsData as FilmAestheticEmbedding[] | null) ?? [])
        .map((row) => [row.film_id, parseEmbedding(row.embedding)] as const)
        .filter(([, embedding]) => embedding)
    );

    const moodCentralityWeightByFilmId = new Map(
      ratedFilms.map((ratedFilm) => [
        ratedFilm.id,
        getCentralityWeight(
          ratedFilm,
          ratedFilms,
          filmMoodEmbeddingByFilmId
        ),
      ])
    );

    const aestheticCentralityWeightByFilmId = new Map(
      ratedFilms.map((ratedFilm) => [
        ratedFilm.id,
        getCentralityWeight(
          ratedFilm,
          ratedFilms,
          filmAestheticEmbeddingByFilmId
        ),
      ])
    );

    function getNearestRatedFilmsScore(
      candidateEmbedding: number[] | null | undefined,
      embeddingByFilmId: Map<string, number[] | null>,
      centralityWeightByFilmId: Map<string, number>
    ) {
      if (!candidateEmbedding) {
        return 0;
      }

      const signals = ratedFilms
        .map((ratedFilm) => {
          const rating = Number(ratedFilm.rating ?? 0);
          const ratingWeight = getRatingWeight(rating);

          if (ratingWeight <= 0) {
            return 0;
          }

          const ratedEmbedding = embeddingByFilmId.get(ratedFilm.id);

          if (!ratedEmbedding) {
            return 0;
          }

          const similarity = cosineSimilarity(
            candidateEmbedding,
            ratedEmbedding
          );
          const effectiveSimilarity = getEffectiveSimilarity(similarity);
          const centralityWeight =
            centralityWeightByFilmId.get(ratedFilm.id) ?? 0.55;

          return effectiveSimilarity * ratingWeight * centralityWeight;
        })
        .filter((signal) => signal > 0)
        .sort((a, b) => b - a);

      const bestSignal = signals[0] ?? 0;
      const secondSignal = signals[1] ?? 0;
      const thirdSignal = signals[2] ?? 0;

      return bestSignal + secondSignal * 0.15 + thirdSignal * 0.05;
    }

    function getProfileTagMatchScore(film: Film) {
      const filmTags = (film.moods ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

      if (!filmTags.length || emotionalProfileTagWeights.size === 0) {
        return 0;
      }

      const matchedScore = filmTags.reduce((sum, tag) => {
        return sum + (emotionalProfileTagWeights.get(tag) ?? 0);
      }, 0);

      return Math.min(1, matchedScore / 6);
    }

    function getEmotionalMatchScore(film: Film) {
      const filmEmbedding = filmMoodEmbeddingByFilmId.get(film.id);

      const nearestScore = getNearestRatedFilmsScore(
        filmEmbedding,
        filmMoodEmbeddingByFilmId,
        moodCentralityWeightByFilmId
      );

      const profileScore = getProfileTagMatchScore(film);

      return profileScore * 0.5 + nearestScore * 0.5;
    }

    function getMaterialMatchScore(film: Film) {
      const filmEmbedding = filmAestheticEmbeddingByFilmId.get(film.id);

      const coreScore = getCoreMatchScore(filmEmbedding, aestheticCores);

      const nearestScore = getNearestRatedFilmsScore(
        filmEmbedding,
        filmAestheticEmbeddingByFilmId,
        aestheticCentralityWeightByFilmId
      );

      return coreScore * 0.5 + nearestScore * 0.5;
    }

    const emotionalScores = films.map((film) => getEmotionalMatchScore(film));
    const materialScores = films.map((film) => getMaterialMatchScore(film));

    const emotionalScoreRange = getScoreRange(emotionalScores);
    const materialScoreRange = getScoreRange(materialScores);

    films.forEach((film, index) => {
      const emotional = emotionalScores[index] ?? 0;
      const material = materialScores[index] ?? 0;
      const normalizedEmotional = normalizeMatchScore(
        emotional,
        emotionalScoreRange
      );
      const normalizedMaterial = normalizeMatchScore(
        material,
        materialScoreRange
      );

      filmScoresById.set(film.id, {
        emotional,
        material,
        balanced: normalizedEmotional * 0.5 + normalizedMaterial * 0.5,
      });
    });

    films = [...films].sort((a, b) => {
      const scoreDifference =
        (getFilmScore(b.id)?.balanced ?? 0) - (getFilmScore(a.id)?.balanced ?? 0);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return (b.year ?? 0) - (a.year ?? 0);
    });

    if (activeFilter === "top picks") {
      films = films.slice(0, 3);
    }

    if (activeFilter === "all") {
      films = films.slice(0, 50);
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
    </main>
  );
}
