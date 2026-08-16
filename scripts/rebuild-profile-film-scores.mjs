import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import {
  MEDIA_TYPE,
  MEDIA_TYPES,
  SCORE_MODE,
  normalizeMediaType,
  oppositeMediaType,
} from "../lib/media-type.mjs";
import {
  buildBalancedScores,
  sortFilmsByScore,
} from "../lib/profile-film-scoring.mjs";
import { selectCandidateFilmsForScoring } from "../lib/profile-film-score-candidates.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const UPSERT_BATCH_SIZE = 200;

function parseEmbedding(value) {
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

function cosineSimilarity(a, b) {
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

function getRatingWeight(rating) {
  if (rating >= 10) return 1;
  if (rating >= 9) return 0.9;
  if (rating >= 8) return 0.75;
  if (rating >= 7) return 0.55;

  return 0;
}

function getEffectiveSimilarity(similarity) {
  const minSimilarity = 0.72;

  if (similarity <= minSimilarity) {
    return 0;
  }

  return (similarity - minSimilarity) / (1 - minSimilarity);
}

function getCoreMatchScore(filmEmbedding, cores) {
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

function getNearestRatedAnchor(
  candidateEmbedding,
  ratedFilms,
  embeddingByFilmId
) {
  const emptyAnchor = {
    score: 0,
    anchorTitle: null,
    anchorRating: null,
    similarity: 0,
    ratingWeight: 0,
    anchorFilmId: null,
  };

  if (!candidateEmbedding) {
    return emptyAnchor;
  }

  let bestAnchor = emptyAnchor;

  for (const ratedFilm of ratedFilms) {
    const rating = Number(ratedFilm.rating ?? 0);
    const ratingWeight = getRatingWeight(rating);

    if (ratingWeight <= 0) {
      continue;
    }

    const ratedEmbedding = embeddingByFilmId.get(ratedFilm.id);

    if (!ratedEmbedding) {
      continue;
    }

    const similarity = cosineSimilarity(candidateEmbedding, ratedEmbedding);
    const effectiveSimilarity = getEffectiveSimilarity(similarity);
    const signal = effectiveSimilarity * ratingWeight;

    if (
      signal > bestAnchor.score ||
      (signal === bestAnchor.score &&
        ratedFilm.id.localeCompare(bestAnchor.anchorFilmId ?? "") < 0)
    ) {
      bestAnchor = {
        score: signal,
        anchorTitle: ratedFilm.title,
        anchorRating: rating,
        similarity,
        ratingWeight,
        anchorFilmId: ratedFilm.id,
      };
    }
  }

  return bestAnchor;
}

function getNearestRatedFilmsScore(
  candidateEmbedding,
  ratedFilms,
  embeddingByFilmId
) {
  return getNearestRatedAnchor(
    candidateEmbedding,
    ratedFilms,
    embeddingByFilmId
  ).score;
}

function getMatchedSignalCount(
  candidateEmbedding,
  ratedFilms,
  embeddingByFilmId
) {
  if (!candidateEmbedding) {
    return 0;
  }

  return ratedFilms.filter((ratedFilm) => {
    const ratingWeight = getRatingWeight(Number(ratedFilm.rating ?? 0));

    if (ratingWeight <= 0) {
      return false;
    }

    const ratedEmbedding = embeddingByFilmId.get(ratedFilm.id);

    if (!ratedEmbedding) {
      return false;
    }

    const similarity = cosineSimilarity(candidateEmbedding, ratedEmbedding);

    return getEffectiveSimilarity(similarity) > 0;
  }).length;
}

function compareFilmsById(a, b) {
  return a.id.localeCompare(b.id);
}

const GENERIC_MATERIAL_TOKENS = new Set([
  "world",
  "animation",
  "anime",
  "film",
  "story",
  "style",
]);

function getProfileTagMatchScore(film, emotionalProfileTagWeights) {
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

function getFilmMaterialTags(film) {
  const filmTags = (film.aesthetic_tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  if (film.technique?.trim()) {
    filmTags.push(film.technique.trim().toLowerCase());
  }

  return filmTags;
}

function tokenizeMaterialTag(tag) {
  return tag
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) => token.length > 1 && !GENERIC_MATERIAL_TOKENS.has(token)
    );
}

function getMaterialTagMatchStrength(profileTag, filmTags) {
  const normalizedProfile = profileTag.trim().toLowerCase();

  for (const filmTag of filmTags) {
    if (filmTag.trim().toLowerCase() === normalizedProfile) {
      return 1;
    }
  }

  const profileTokens = tokenizeMaterialTag(normalizedProfile);

  if (profileTokens.length === 0) {
    return 0;
  }

  let bestMatch = 0;

  for (const filmTag of filmTags) {
    const normalizedFilm = filmTag.trim().toLowerCase();

    if (
      normalizedFilm.includes(normalizedProfile) ||
      normalizedProfile.includes(normalizedFilm)
    ) {
      bestMatch = Math.max(bestMatch, 0.85);
      continue;
    }

    const filmTokens = tokenizeMaterialTag(normalizedFilm);

    if (filmTokens.length === 0) {
      continue;
    }

    const sharedTokens = profileTokens.filter((token) =>
      filmTokens.includes(token)
    );

    if (sharedTokens.length === 0) {
      continue;
    }

    const overlapRatio =
      sharedTokens.length / Math.min(profileTokens.length, filmTokens.length);

    if (overlapRatio >= 0.5) {
      bestMatch = Math.max(bestMatch, overlapRatio);
    }
  }

  return bestMatch;
}

function getMaterialProfileTagMatchScore(film, aestheticProfileTagWeights) {
  const filmTags = getFilmMaterialTags(film);

  if (!filmTags.length || aestheticProfileTagWeights.size === 0) {
    return 0;
  }

  let matchedScore = 0;

  for (const [profileTag, weight] of aestheticProfileTagWeights) {
    const matchStrength = getMaterialTagMatchStrength(profileTag, filmTags);

    if (matchStrength > 0) {
      matchedScore += weight * matchStrength;
    }
  }

  return Math.min(1, matchedScore / 6);
}

function getProfileGate(profileFit) {
  if (profileFit >= 0.45) {
    return 1;
  }

  if (profileFit >= 0.35) {
    return 0.9;
  }

  if (profileFit >= 0.25) {
    return 0.7;
  }

  return 0.45;
}

function getProfileFit(film, emotionalProfileTagWeights, aestheticProfileTagWeights) {
  const emotionalProfileFit = getProfileTagMatchScore(
    film,
    emotionalProfileTagWeights
  );
  const materialProfileFit = getMaterialProfileTagMatchScore(
    film,
    aestheticProfileTagWeights
  );

  return (emotionalProfileFit + materialProfileFit) / 2;
}

/** Cross-media uses emotional tags only — never aesthetic/technique from the source profile. */
function getEmotionalOnlyProfileFit(film, emotionalProfileTagWeights) {
  return getProfileTagMatchScore(film, emotionalProfileTagWeights);
}

function getGatedEmotionalOnlyScores(
  film,
  filmMoodEmbeddingByFilmId,
  ratedFilms,
  emotionalProfileTagWeights
) {
  const profileFit = getEmotionalOnlyProfileFit(
    film,
    emotionalProfileTagWeights
  );
  const profileGate = getProfileGate(profileFit);
  const emotionalAnchor = getNearestRatedAnchor(
    filmMoodEmbeddingByFilmId.get(film.id),
    ratedFilms,
    filmMoodEmbeddingByFilmId
  );

  return {
    emotional_score: emotionalAnchor.score * profileGate,
    material_score: 0,
    profileFit,
    profileGate,
    emotionalAnchor,
    materialAnchor: {
      score: 0,
      anchorTitle: null,
      anchorRating: null,
      similarity: 0,
      ratingWeight: 0,
      anchorFilmId: null,
    },
  };
}

function filterFilmsByMediaType(films, mediaType) {
  const normalized = normalizeMediaType(mediaType);
  return (films ?? []).filter(
    (film) =>
      normalizeMediaType(film.media_type, MEDIA_TYPE.animation) === normalized
  );
}

function getOldBlendedEmotionalScore(
  film,
  filmMoodEmbeddingByFilmId,
  ratedFilms,
  emotionalProfileTagWeights
) {
  const filmEmbedding = filmMoodEmbeddingByFilmId.get(film.id);
  const nearestScore = getNearestRatedFilmsScore(
    filmEmbedding,
    ratedFilms,
    filmMoodEmbeddingByFilmId
  );
  const profileScore = getProfileTagMatchScore(film, emotionalProfileTagWeights);

  return profileScore * 0.5 + nearestScore * 0.5;
}

function getOldBlendedMaterialScore(
  film,
  filmAestheticEmbeddingByFilmId,
  ratedFilms,
  aestheticProfileTagWeights
) {
  const filmEmbedding = filmAestheticEmbeddingByFilmId.get(film.id);
  const profileScore = getMaterialProfileTagMatchScore(
    film,
    aestheticProfileTagWeights
  );
  const nearestScore = getNearestRatedFilmsScore(
    filmEmbedding,
    ratedFilms,
    filmAestheticEmbeddingByFilmId
  );

  return profileScore * 0.5 + nearestScore * 0.5;
}

function getGatedDimensionScores(
  film,
  filmMoodEmbeddingByFilmId,
  filmAestheticEmbeddingByFilmId,
  ratedFilms,
  emotionalProfileTagWeights,
  aestheticProfileTagWeights
) {
  const profileFit = getProfileFit(
    film,
    emotionalProfileTagWeights,
    aestheticProfileTagWeights
  );
  const profileGate = getProfileGate(profileFit);

  const emotionalAnchor = getNearestRatedAnchor(
    filmMoodEmbeddingByFilmId.get(film.id),
    ratedFilms,
    filmMoodEmbeddingByFilmId
  );
  const materialAnchor = getNearestRatedAnchor(
    filmAestheticEmbeddingByFilmId.get(film.id),
    ratedFilms,
    filmAestheticEmbeddingByFilmId
  );

  return {
    emotional_score: emotionalAnchor.score * profileGate,
    material_score: materialAnchor.score * profileGate,
    profileFit,
    profileGate,
    emotionalAnchor,
    materialAnchor,
  };
}

export async function getProfiles(profileSlug) {
  let query = supabase.from("profiles").select("id, slug, name").order("slug");

  if (profileSlug) {
    query = query.eq("slug", profileSlug);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getTasteCores(profileId, mediaType = MEDIA_TYPE.animation) {
  const normalizedMedia = normalizeMediaType(mediaType);
  const { data, error } = await supabase
    .from("profile_taste_cores")
    .select("*")
    .eq("profile_id", profileId)
    .eq("media_type", normalizedMedia)
    .order("core_index");

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((core) => ({
      ...core,
      centerEmbedding: parseEmbedding(core.center_embedding),
    }))
    .filter((core) => core.centerEmbedding);
}

export async function getAllFilms() {
  const { data, error } = await supabase
    .from("films")
    .select("id, title, moods, aesthetic_tags, technique, year, media_type")
    .order("id");

  if (error) {
    throw error;
  }

  return (data ?? []).map((film) => ({
    ...film,
    media_type: normalizeMediaType(film.media_type, MEDIA_TYPE.animation),
  }));
}

async function getRatings(profileId) {
  const { data, error } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profileId)
    .order("film_id");

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getFilmEmbeddings(tableName, filmIds) {
  if (!filmIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("film_id, embedding")
    .in("film_id", filmIds)
    .order("film_id");

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? [])
      .map((row) => [row.film_id, parseEmbedding(row.embedding)])
      .filter(([, embedding]) => embedding)
  );
}

async function upsertScores(profileId, scoreRows) {
  const { error: deleteError } = await supabase
    .from("profile_film_scores")
    .delete()
    .eq("profile_id", profileId);

  if (deleteError) {
    throw deleteError;
  }

  for (let index = 0; index < scoreRows.length; index += UPSERT_BATCH_SIZE) {
    const batch = scoreRows.slice(index, index + UPSERT_BATCH_SIZE);

    const { error } = await supabase.from("profile_film_scores").insert(batch);

    if (error) {
      throw error;
    }
  }
}

/**
 * Upsert score rows without deleting other films for the profile.
 * Used when scoring newly added films only.
 */
export async function upsertScoreRows(profileId, scoreRows) {
  if (!scoreRows?.length) return;

  for (let index = 0; index < scoreRows.length; index += UPSERT_BATCH_SIZE) {
    const batch = scoreRows.slice(index, index + UPSERT_BATCH_SIZE).map((row) => ({
      profile_id: profileId,
      film_id: row.film_id,
      emotional_score: row.emotional_score,
      material_score: row.material_score,
      score_mode: row.score_mode ?? SCORE_MODE.native,
      source_media: row.source_media ?? MEDIA_TYPE.animation,
      computed_at: row.computed_at,
    }));

    // Prefer multi-mode unique; fall back to legacy PK (profile_id, film_id).
    let { error } = await supabase.from("profile_film_scores").upsert(batch, {
      onConflict: "profile_id,film_id,score_mode,source_media",
    });

    if (error && /no unique|ON CONFLICT|42P10|score_mode/i.test(error.message)) {
      ({ error } = await supabase.from("profile_film_scores").upsert(batch, {
        onConflict: "profile_id,film_id",
      }));
    }

    if (error) {
      throw error;
    }
  }
}

export { selectCandidateFilmsForScoring } from "../lib/profile-film-score-candidates.mjs";

/**
 * Score unrated candidates for one media / score-mode combination.
 *
 * Native: anchors + cores + candidates all share the same media_type; material included.
 * Cross-media: anchors/cores from sourceMedia (emotional only); candidates from targetMedia;
 * material_score forced to 0. Never writes/merges taste cores.
 *
 * @param {object} profile
 * @param {object[]} allFilms
 * @param {{
 *   mediaType?: string,
 *   scoreMode?: string,
 *   sourceMedia?: string,
 *   filmIds?: string[] | null,
 *   quiet?: boolean,
 * }} [options]
 */
export async function calculateProfileScores(profile, allFilms, options = {}) {
  const scoreMode = normalizeScoreModeOption(options.scoreMode);
  const sourceMedia = normalizeMediaType(
    options.sourceMedia ??
      (scoreMode === SCORE_MODE.crossMedia
        ? MEDIA_TYPE.animation
        : options.mediaType),
    MEDIA_TYPE.animation
  );
  const targetMedia =
    scoreMode === SCORE_MODE.crossMedia
      ? normalizeMediaType(
          options.mediaType ?? oppositeMediaType(sourceMedia),
          oppositeMediaType(sourceMedia)
        )
      : normalizeMediaType(options.mediaType ?? sourceMedia, sourceMedia);

  const filmIdsRestrict = Array.isArray(options.filmIds)
    ? options.filmIds.filter(Boolean)
    : null;
  const quiet = Boolean(options.quiet);
  const incremental = Boolean(filmIdsRestrict?.length);
  const isCrossMedia = scoreMode === SCORE_MODE.crossMedia;

  if (!quiet) {
    console.log(
      `\nRebuilding ${scoreMode} scores for ${profile.slug} (${profile.name})` +
        ` source=${sourceMedia} target=${targetMedia}` +
        `${incremental ? ` [incremental ${filmIdsRestrict.length} film(s)]` : ""}`
    );
  }

  const tasteCores = await getTasteCores(profile.id, sourceMedia);
  const emotionalCores = tasteCores.filter(
    (core) => core.core_type === "emotional"
  );
  const aestheticCores = isCrossMedia
    ? []
    : tasteCores.filter((core) => core.core_type === "aesthetic");

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

  const aestheticProfileTags = aestheticCores
    .flatMap((core) => core.aesthetic_profile_tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const aestheticProfileTagWeights = new Map(
    aestheticProfileTags.map((tag, index) => [
      tag,
      Math.max(0.55, 1 - index * 0.05),
    ])
  );

  const ratings = await getRatings(profile.id);
  const ratingByFilmId = new Map(
    ratings
      .filter((item) => item.rating !== null)
      .map((item) => [item.film_id, item.rating])
  );

  const sourceFilms = filterFilmsByMediaType(allFilms, sourceMedia);
  const targetFilms = filterFilmsByMediaType(allFilms, targetMedia);

  const ratedFilms = sourceFilms
    .map((film) => ({
      ...film,
      rating: ratingByFilmId.get(film.id) ?? null,
    }))
    .filter((film) => Number(film.rating ?? 0) >= 7)
    .sort(compareFilmsById);

  const candidateFilms = selectCandidateFilmsForScoring(
    targetFilms,
    ratings,
    filmIdsRestrict,
    compareFilmsById
  );

  if (!candidateFilms.length) {
    if (!quiet) {
      console.log(
        incremental
          ? "  No matching unrated films to score in this set."
          : "  No unrated films to score."
      );
    }
    return [];
  }

  const embedFilmIds = [
    ...new Set([
      ...ratedFilms.map((film) => film.id),
      ...candidateFilms.map((film) => film.id),
    ]),
  ];

  const filmMoodEmbeddingByFilmId = await getFilmEmbeddings(
    "film_mood_embeddings",
    embedFilmIds
  );
  const filmAestheticEmbeddingByFilmId = isCrossMedia
    ? new Map()
    : await getFilmEmbeddings("film_aesthetic_embeddings", embedFilmIds);

  const computedAt = new Date().toISOString();
  const gatedScoresByFilmId = new Map();

  const scoreRows = candidateFilms.map((film) => {
    const gatedScores = isCrossMedia
      ? getGatedEmotionalOnlyScores(
          film,
          filmMoodEmbeddingByFilmId,
          ratedFilms,
          emotionalProfileTagWeights
        )
      : getGatedDimensionScores(
          film,
          filmMoodEmbeddingByFilmId,
          filmAestheticEmbeddingByFilmId,
          ratedFilms,
          emotionalProfileTagWeights,
          aestheticProfileTagWeights
        );

    gatedScoresByFilmId.set(film.id, gatedScores);

    return {
      profile_id: profile.id,
      film_id: film.id,
      emotional_score: gatedScores.emotional_score,
      material_score: gatedScores.material_score,
      score_mode: scoreMode,
      source_media: sourceMedia,
      computed_at: computedAt,
    };
  });

  if (quiet) {
    return scoreRows;
  }

  const rawScoresByFilmId = new Map(
    scoreRows.map((row) => [
      row.film_id,
      {
        emotional: row.emotional_score,
        material: row.material_score,
      },
    ])
  );

  const balancedScores = buildBalancedScores(candidateFilms, rawScoresByFilmId);

  if (!isCrossMedia) {
    const oldRawScoresByFilmId = new Map(
      candidateFilms.map((film) => [
        film.id,
        {
          emotional: getOldBlendedEmotionalScore(
            film,
            filmMoodEmbeddingByFilmId,
            ratedFilms,
            emotionalProfileTagWeights
          ),
          material: getOldBlendedMaterialScore(
            film,
            filmAestheticEmbeddingByFilmId,
            ratedFilms,
            aestheticProfileTagWeights
          ),
        },
      ])
    );
    const oldBalancedScores = buildBalancedScores(
      candidateFilms,
      oldRawScoresByFilmId
    );

    for (const film of candidateFilms) {
      const emotionalMatchedCount = getMatchedSignalCount(
        filmMoodEmbeddingByFilmId.get(film.id),
        ratedFilms,
        filmMoodEmbeddingByFilmId
      );
      const materialMatchedCount = getMatchedSignalCount(
        filmAestheticEmbeddingByFilmId.get(film.id),
        ratedFilms,
        filmAestheticEmbeddingByFilmId
      );
      const existingScore = balancedScores.get(film.id);

      if (existingScore) {
        existingScore.matchedSignalCount =
          emotionalMatchedCount + materialMatchedCount;
      }
    }

    const oldTopFilms = sortFilmsByScore(candidateFilms, oldBalancedScores).slice(
      0,
      10
    );
    console.log("  Old 50/50 blend top 10:");
    oldTopFilms.forEach((film, index) => {
      const score = oldBalancedScores.get(film.id)?.balanced ?? 0;
      console.log(`    ${index + 1}. ${film.title} — balanced: ${score.toFixed(4)}`);
    });
  }

  const newTopFilms = sortFilmsByScore(candidateFilms, balancedScores).slice(
    0,
    10
  );

  console.log(
    isCrossMedia
      ? "  Cross-media emotional-only top 10:"
      : "  New anchor × lenient profileGate top 10:"
  );

  newTopFilms.forEach((film, index) => {
    const finalScore = balancedScores.get(film.id)?.balanced ?? 0;
    const gatedScores = gatedScoresByFilmId.get(film.id);
    const emotionalAnchor = gatedScores?.emotionalAnchor;

    console.log(
      `    ${index + 1}. ${film.title} — finalScore: ${finalScore.toFixed(4)}`
    );
    console.log(
      `       anchor: "${emotionalAnchor?.anchorTitle ?? "—"}" ` +
        `rating=${emotionalAnchor?.anchorRating ?? "—"} ` +
        `anchorScore=${emotionalAnchor?.score.toFixed(4) ?? "0.0000"} ` +
        `profileFit=${(gatedScores?.profileFit ?? 0).toFixed(4)} ` +
        `profileGate=${(gatedScores?.profileGate ?? 0).toFixed(2)}`
    );
  });

  return scoreRows;
}

function normalizeScoreModeOption(value) {
  if (value === SCORE_MODE.crossMedia) return SCORE_MODE.crossMedia;
  return SCORE_MODE.native;
}

/**
 * Emotional-only transfer: source media taste → target media candidates.
 * Does not mutate taste cores of either media.
 */
export async function calculateCrossMediaScores(
  profile,
  allFilms,
  options = {}
) {
  const sourceMedia = normalizeMediaType(
    options.sourceMedia,
    MEDIA_TYPE.animation
  );
  const targetMedia = normalizeMediaType(
    options.targetMedia ?? oppositeMediaType(sourceMedia),
    oppositeMediaType(sourceMedia)
  );

  return calculateProfileScores(profile, allFilms, {
    ...options,
    scoreMode: SCORE_MODE.crossMedia,
    sourceMedia,
    mediaType: targetMedia,
  });
}

/**
 * Full artifact set for a profile: native scores per media only.
 * Isolation: each call only reads ratings/cores for its source media.
 */
export async function calculateAllProfileScoreArtifacts(
  profile,
  allFilms,
  options = {}
) {
  const quiet = options.quiet !== false;
  const filmIds = options.filmIds ?? null;
  const rows = [];

  // Catalog ranking is native-only per media (Films ← live-action likes,
  // Animation ← animation likes). Cross-media scores are not written here.
  for (const mediaType of MEDIA_TYPES) {
    const nativeRows = await calculateProfileScores(profile, allFilms, {
      mediaType,
      scoreMode: SCORE_MODE.native,
      sourceMedia: mediaType,
      filmIds,
      quiet,
    });
    rows.push(...nativeRows);
  }

  return rows;
}

/**
 * Score only newly added films for every profile (no full-catalog rebuild).
 * Always writes native scores for each film's own media_type (Films from
 * live-action taste, Animation from animation taste). Rating-triggered jobs
 * keep using full rebuildProfileScores + replace-all.
 *
 * @param {string[]} filmIds
 * @param {{ profiles?: object[], allFilms?: object[] }} [options]
 */
export async function scoreNewFilmsForAllProfiles(filmIds, options = {}) {
  const ids = [...new Set((filmIds ?? []).filter(Boolean))];
  if (!ids.length) {
    return { profileCount: 0, rowCount: 0, emptyProfiles: 0 };
  }

  const profiles = options.profiles ?? (await getProfiles());
  const allFilms = options.allFilms ?? (await getAllFilms());
  const newFilms = allFilms.filter((film) => ids.includes(film.id));
  const mediaTypesPresent = [
    ...new Set(
      newFilms.map((film) =>
        normalizeMediaType(film.media_type, MEDIA_TYPE.animation)
      )
    ),
  ];

  let rowCount = 0;
  let emptyProfiles = 0;

  console.log(
    `\n▶ Incremental native profile scores for ${ids.length} film(s) × ${profiles.length} profile(s)\n`
  );

  for (const profile of profiles) {
    const scoreRows = [];

    for (const mediaType of mediaTypesPresent) {
      const mediaFilmIds = newFilms
        .filter(
          (film) =>
            normalizeMediaType(film.media_type, MEDIA_TYPE.animation) ===
            mediaType
        )
        .map((film) => film.id);

      if (!mediaFilmIds.length) continue;

      scoreRows.push(
        ...(await calculateProfileScores(profile, allFilms, {
          mediaType,
          scoreMode: SCORE_MODE.native,
          sourceMedia: mediaType,
          filmIds: mediaFilmIds,
          quiet: true,
        }))
      );
    }

    if (!scoreRows.length) {
      emptyProfiles += 1;
      continue;
    }
    await upsertScoreRows(profile.id, scoreRows);
    rowCount += scoreRows.length;
    console.log(
      `  ${profile.slug ?? profile.id}: upserted ${scoreRows.length} score row(s)`
    );
  }

  console.log(
    `\nDone incremental scores: profiles=${profiles.length}, rows=${rowCount}, empty=${emptyProfiles}\n`
  );

  return {
    profileCount: profiles.length,
    rowCount,
    emptyProfiles,
  };
}

export async function rebuildProfileScores(profile, allFilms) {
  const { rebuildEmotionalTasteCoresForProfile } = await import(
    "./build-taste-cores.mjs"
  );
  const { rebuildAestheticTasteCoresForProfile } = await import(
    "./build-aesthetic-cores.mjs"
  );

  await rebuildEmotionalTasteCoresForProfile(profile);
  await rebuildAestheticTasteCoresForProfile(profile);

  const scoreRows = await calculateAllProfileScoreArtifacts(profile, allFilms, {
    quiet: false,
  });
  await upsertScores(profile.id, scoreRows);
  console.log(`  Stored ${scoreRows.length} native film scores (all media).`);
}

async function main() {
  const profileSlugArg = process.argv.find((arg) => arg.startsWith("--profile="));
  const profileSlug = profileSlugArg?.split("=")[1] ?? null;

  const profiles = await getProfiles(profileSlug);

  if (!profiles.length) {
    console.log(
      profileSlug
        ? `No profile found for slug: ${profileSlug}`
        : "No profiles found."
    );
    return;
  }

  const allFilms = await getAllFilms();

  if (!allFilms.length) {
    console.log("No films found.");
    return;
  }

  for (const profile of profiles) {
    await rebuildProfileScores(profile, allFilms);
  }

  console.log("\nDone: profile film scores rebuilt.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("\nRebuild profile film scores failed.\n", error);
    process.exit(1);
  });
}
