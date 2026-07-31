/**
 * Measure public catalog load stages mirroring loadPublicFilmCatalog().
 * Dev/diagnostic only — prints counts and timings, never rating/film contents.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/measure-public-catalog-load.mjs
 *   APP_ENV=hosted node scripts/measure-public-catalog-load.mjs --out=reports/catalog-load-after.json
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { applyAppEnv } from "./load-app-env.mjs";
import { applyPublicCatalogVisibilityFilter } from "../lib/public-catalog-films.mjs";
import {
  countLikedHighRatings,
  sortFilmsByColdStart,
  sortFilmsForDualModeCatalog,
} from "../lib/profile-film-scoring.mjs";
import { loadPublicFestivalClaimsByFilmIds } from "../lib/load-film-festival-claims-public.mjs";
import {
  loadFilmFestivalRecognitionsByFilmIds,
  PUBLIC_FESTIVAL_RECOGNITION_BADGE_FIELDS,
} from "../lib/load-film-festival-recognitions.mjs";

applyAppEnv();

/** Keep in sync with lib/load-public-film-catalog.ts PUBLIC_CATALOG_FILM_FIELDS */
const PUBLIC_CATALOG_FILM_FIELDS = [
  "id",
  "title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "festival",
  "poster_url",
  "image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "what_it_is",
  "the_mood",
  "technique",
  "cold_start_score",
  "quick_filters",
].join(", ");

const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outPath = outArg?.slice("--out=".length) ?? null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error("Missing Supabase env (URL / anon / service role).");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function timeAsync(run) {
  const startedAt = Date.now();
  const value = await run();
  return { value, ms: Date.now() - startedAt };
}

function timeSync(run) {
  const startedAt = Date.now();
  const value = run();
  return { value, ms: Date.now() - startedAt };
}

async function attachPublicFestivalBadgesDbOnly(films) {
  if (films.length === 0) {
    return films;
  }
  const filmIds = films.map((film) => film.id);
  await Promise.all([
    loadPublicFestivalClaimsByFilmIds(anon, filmIds),
    loadFilmFestivalRecognitionsByFilmIds(anon, filmIds, {
      fields: PUBLIC_FESTIVAL_RECOGNITION_BADGE_FIELDS,
    }),
  ]);
  return films;
}

async function loadPublicBase() {
  const [filmsTimed, awardIdsTimed] = await Promise.all([
    timeAsync(() =>
      applyPublicCatalogVisibilityFilter(
        anon.from("films").select(PUBLIC_CATALOG_FILM_FIELDS)
      )
    ),
    timeAsync(() =>
      anon
        .from("film_festival_recognitions")
        .select("film_id")
        .eq("import_source", "manual_verified_major_awards_v1")
        .eq("recognition_type", "award")
        .eq("award_result", "grand_prize")
    ),
  ]);

  const filmsData = filmsTimed.value.data ?? [];
  const badgesTimed = await timeAsync(() =>
    attachPublicFestivalBadgesDbOnly(filmsData)
  );

  return {
    films: badgesTimed.value,
    filmsMs: filmsTimed.ms,
    awardIdsMs: awardIdsTimed.ms,
    festivalBadgesMs: badgesTimed.ms,
    filmsJsonBytes: Buffer.byteLength(JSON.stringify(filmsData), "utf8"),
  };
}

async function loadPersonalized(profileId, { forceEmptyScores = false } = {}) {
  const [ratingsTimed, savedTimed] = await Promise.all([
    timeAsync(() =>
      admin
        .from("film_ratings")
        .select("film_id, rating")
        .eq("profile_id", profileId)
    ),
    timeAsync(() =>
      admin
        .from("profile_film_lists")
        .select("film_id")
        .eq("profile_id", profileId)
        .eq("list_type", "to_watch")
    ),
  ]);

  const ratings = ratingsTimed.value.data ?? [];
  let scoresMs = null;
  let scoreRows = null;
  let scoresUnavailable = false;

  if (countLikedHighRatings(ratings) > 0) {
    const scoresProfileId = forceEmptyScores
      ? "00000000-0000-4000-8000-000000000000"
      : profileId;
    const scoresTimed = await timeAsync(() =>
      admin
        .from("profile_film_scores")
        .select("film_id, emotional_score, material_score")
        .eq("profile_id", scoresProfileId)
    );
    scoresMs = scoresTimed.ms;
    if (scoresTimed.value.error) {
      scoresUnavailable = true;
      scoreRows = null;
    } else {
      scoreRows = scoresTimed.value.data ?? [];
    }
  }

  return {
    ratings,
    scoreRows,
    scoresUnavailable,
    ratingsMs: ratingsTimed.ms,
    savedMs: savedTimed.ms,
    scoresMs,
  };
}

async function measureScenario(scenario) {
  const totalStarted = Date.now();

  // Mirror production: kick public base, await auth, overlap personalization.
  const publicBasePromise = loadPublicBase();

  const authTimed = await timeAsync(async () => {
    if (!scenario.profileId) {
      return null;
    }
    const { data } = await admin
      .from("profiles")
      .select("id, name, slug")
      .eq("id", scenario.profileId)
      .maybeSingle();
    return data;
  });

  const personalizedPromise = scenario.profileId
    ? loadPersonalized(scenario.profileId, {
        forceEmptyScores: scenario.forceEmptyScores,
      })
    : Promise.resolve({
        ratings: [],
        scoreRows: null,
        scoresUnavailable: false,
        ratingsMs: 0,
        savedMs: 0,
        scoresMs: null,
      });

  const overlapStarted = Date.now();
  const [publicBase, personalized] = await Promise.all([
    publicBasePromise,
    personalizedPromise,
  ]);
  const overlapWallMs = Date.now() - overlapStarted;

  const sortTimed = timeSync(() => {
    const ratedFilmIds = new Set(
      personalized.ratings.map((row) => row.film_id).filter(Boolean)
    );
    const unratedFilms = publicBase.films.filter(
      (film) => !ratedFilmIds.has(film.id)
    );
    const ratedFilms = publicBase.films.filter((film) =>
      ratedFilmIds.has(film.id)
    );
    const sorted = sortFilmsForDualModeCatalog({
      films: unratedFilms,
      viewer: scenario.profileId ? "authenticated" : "guest",
      ratings: personalized.ratings,
      scoreRows: personalized.scoreRows,
      scoresUnavailable: personalized.scoresUnavailable,
    });
    return {
      films: [...sorted.films, ...sortFilmsByColdStart(ratedFilms)],
      mode: sorted.mode,
      reason: sorted.reason,
      scoresFallbackCause: sorted.scoresFallbackCause,
    };
  });

  return {
    scenario: scenario.name,
    viewer: scenario.profileId ? "authenticated" : "guest",
    filmsCount: publicBase.films.length,
    filmsJsonBytes: publicBase.filmsJsonBytes,
    likedHighRatedCount: countLikedHighRatings(personalized.ratings),
    scoresRowCount: personalized.scoreRows?.length ?? null,
    rankingMode: sortTimed.value.mode,
    rankingReason: sortTimed.value.reason,
    scoresFallbackCause: sortTimed.value.scoresFallbackCause,
    forceEmptyScores: Boolean(scenario.forceEmptyScores),
    authMs: authTimed.ms,
    filmsMs: publicBase.filmsMs,
    awardIdsMs: publicBase.awardIdsMs,
    festivalBadgesMs: publicBase.festivalBadgesMs,
    ratingsMs: scenario.profileId ? personalized.ratingsMs : null,
    savedMs: scenario.profileId ? personalized.savedMs : null,
    scoresMs: personalized.scoresMs,
    normalizeSortMs: sortTimed.ms,
    authThenOverlapWallMs: overlapWallMs,
    totalMs: Date.now() - totalStarted,
    parallelNote:
      "publicBase(films∥awards→badges) overlaps personalization(ratings∥saved→scores) after auth",
  };
}

async function findScenarioProfiles() {
  const { data: ratingRows, error: ratingsError } = await admin
    .from("film_ratings")
    .select("profile_id, rating");
  if (ratingsError) {
    throw ratingsError;
  }

  const ratingsByProfile = new Map();
  for (const row of ratingRows ?? []) {
    const list = ratingsByProfile.get(row.profile_id) ?? [];
    list.push(row);
    ratingsByProfile.set(row.profile_id, list);
  }

  let authNoHigh = null;
  let authWithScores = null;
  let authHighEmptyScores = null;

  for (const [profileId, ratings] of ratingsByProfile.entries()) {
    const liked = countLikedHighRatings(ratings);
    if (!authNoHigh && liked === 0) {
      authNoHigh = profileId;
    }
    if (liked === 0) {
      continue;
    }

    const { count, error } = await admin
      .from("profile_film_scores")
      .select("film_id", { count: "exact", head: true })
      .eq("profile_id", profileId);
    if (error) {
      throw error;
    }

    if (!authWithScores && (count ?? 0) > 0) {
      authWithScores = profileId;
    }
    if (!authHighEmptyScores && (count ?? 0) === 0) {
      authHighEmptyScores = profileId;
    }

    if (authNoHigh && authWithScores && authHighEmptyScores) {
      break;
    }
  }

  if (!authNoHigh) {
    const { data: profiles } = await admin.from("profiles").select("id").limit(50);
    for (const profile of profiles ?? []) {
      if (!ratingsByProfile.has(profile.id)) {
        authNoHigh = profile.id;
        break;
      }
    }
  }

  const emptyScoresIsSynthetic =
    !authHighEmptyScores && Boolean(authWithScores);
  if (emptyScoresIsSynthetic) {
    authHighEmptyScores = authWithScores;
  }

  return {
    authNoHigh,
    authWithScores,
    authHighEmptyScores,
    emptyScoresIsSynthetic,
  };
}

async function main() {
  const profiles = await findScenarioProfiles();

  const scenarios = [
    { name: "guest", profileId: null },
    { name: "auth-no-rating-ge-7", profileId: profiles.authNoHigh },
    {
      name: "auth-rating-ge-7-with-scores",
      profileId: profiles.authWithScores,
    },
    {
      name: "auth-rating-ge-7-empty-scores",
      profileId: profiles.authHighEmptyScores,
      forceEmptyScores: profiles.emptyScoresIsSynthetic,
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    if (scenario.name !== "guest" && !scenario.profileId) {
      results.push({
        scenario: scenario.name,
        skipped: true,
        reason: "No matching profile found in DB",
      });
      continue;
    }

    await measureScenario(scenario);
    results.push(await measureScenario(scenario));
  }

  const payload = {
    measuredAt: new Date().toISOString(),
    optimization: "slim-fields+slim-badges+auth-overlap-personalization",
    results,
  };
  const text = JSON.stringify(payload, null, 2);
  console.log(text);
  if (outPath) {
    writeFileSync(outPath, `${text}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
