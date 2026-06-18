import { supabase } from "@/lib/supabase";
import {
  buildBalancedScores,
  FilmScore,
  logColdStartDiagnostics,
  RawFilmScore,
  sortFilmsByColdStart,
  sortFilmsByScore,
} from "@/lib/profile-film-scoring";
import { Film } from "@/types/film";
import ProfileTabs from "@/components/ProfileTabs";
import { buildFilmRatings } from "@/lib/film-ratings";
import { normalizeFilms } from "@/lib/normalize-film";
import { createProfilePageLoadTimer } from "@/lib/profile-page-load-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const ALL_FILMS_PAGE_SIZE = 50;
const SHOW_DEBUG_SCORES = process.env.NEXT_PUBLIC_SHOW_DEBUG_SCORES === "true";

const FILM_SELECT_FIELDS = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "festival",
  "section",
  "source_url",
  "watch_url",
  "image_url",
  "poster_url",
  "trailer_url",
  "availability",
  "synopsis",
  "technique",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
  "themes",
  "dialogue",
  "emotional_intensity",
  "weirdness",
  "kid_safety",
  "why_i_might_like_it",
  "personal_note",
  "status",
  "cold_start_score",
  "cold_start_note",
  "created_at",
].join(", ");

function scoresMapToRecord(scores: Map<string, FilmScore>) {
  return Object.fromEntries(scores);
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ token?: string }>;
}) {
  const routeParams = await params;
  const queryParams = await searchParams;

  const profileSlug = routeParams.slug;
  const token = queryParams?.token;

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

  const logProfilePageLoad = createProfilePageLoadTimer();

  const [
    { data: tasteCoresData },
    { data: allFilmsData, error },
    { data: ratings, error: ratingsError },
    { data: watchlistItems },
    { data: scoreRows },
  ] = await Promise.all([
    supabase
      .from("profile_taste_cores")
      .select(
        "id, core_index, core_type, name, strength, coverage, maturity, nearest_moods, emotional_profile_tags, aesthetic_profile_tags"
      )
      .eq("profile_id", profile.id)
      .order("core_index"),
    supabase.from("films").select(FILM_SELECT_FIELDS).order("id"),
    supabase
      .from("film_ratings")
      .select("film_id, rating")
      .eq("profile_id", profile.id)
      .order("film_id"),
    supabase
      .from("profile_film_lists")
      .select("film_id")
      .eq("profile_id", profile.id)
      .eq("list_type", "to_watch")
      .order("film_id"),
    supabase
      .from("profile_film_scores")
      .select("film_id, emotional_score, material_score")
      .eq("profile_id", profile.id)
      .order("film_id"),
  ]);

  const tasteCores = (tasteCoresData as ProfileTasteCore[] | null) ?? [];
  const allFilms = normalizeFilms((allFilmsData as Film[] | null) ?? []);
  const safeRatings = ratings ?? [];
  const ratedFilmIds = new Set(safeRatings.map((item) => item.film_id).filter(Boolean));
  const filmRatings = buildFilmRatings(safeRatings);
  const savedFilmIds = new Set(
    watchlistItems?.map((item) => item.film_id) ?? []
  );

  const savedFilms = allFilms.filter((film) => savedFilmIds.has(film.id));
  const watchedFilms = allFilms.filter((film) => ratedFilmIds.has(film.id));

  const allFilmsCandidates = allFilms.filter(
    (film) => !ratedFilmIds.has(film.id)
  );

  const rawScoresByFilmId = new Map<string, RawFilmScore>(
    (scoreRows ?? []).map((row) => [
      row.film_id,
      {
        emotional: Number(row.emotional_score ?? 0),
        material: Number(row.material_score ?? 0),
      },
    ])
  );

  const likedHighRatedCount =
    safeRatings.filter((item) => Number(item.rating) >= 7).length;
  const isColdStartMode = likedHighRatedCount === 0;
  const ratingsCount = safeRatings.length;

  if (ratingsError) {
    console.error("[profile-page] ratings load error", ratingsError);
  }

  logProfilePageLoad({
    slug: profileSlug,
    ratingsCount,
    likedHighRatedCount,
    isColdStartMode,
    filmsCount: allFilms.length,
  });

  let allFilmsSorted: Film[];
  let allFilmsScores: Record<string, FilmScore>;

  if (isColdStartMode) {
    allFilmsSorted = sortFilmsByColdStart(allFilmsCandidates);
    allFilmsScores = {};
    logColdStartDiagnostics(
      profile,
      safeRatings,
      allFilmsCandidates,
      allFilmsSorted
    );
  } else {
    const allFilmsBalancedScores = buildBalancedScores(
      allFilmsCandidates,
      rawScoresByFilmId
    );
    allFilmsSorted = sortFilmsByScore(
      allFilmsCandidates,
      allFilmsBalancedScores
    );
    allFilmsScores = scoresMapToRecord(allFilmsBalancedScores);
  }

  const loadError = error?.message ?? null;

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl p-8">
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

      <ProfileTabs
        profileSlug={profileSlug}
        profileId={profile.id ?? ""}
        token={token ?? ""}
        profileName={profile.name}
        tasteProfile={profile.taste_profile}
        tasteProfileUpdatedAt={profile.taste_profile_updated_at}
        tasteCores={tasteCores}
        allFilmsSorted={allFilmsSorted}
        allFilmsScores={allFilmsScores}
        isColdStartMode={isColdStartMode}
        savedFilms={savedFilms}
        watchedFilms={watchedFilms}
        allFilmsPageSize={ALL_FILMS_PAGE_SIZE}
        filmRatings={filmRatings}
        showDebugScores={SHOW_DEBUG_SCORES}
        loadError={loadError}
      />
    </main>
  );
}
