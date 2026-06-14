import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildBalancedScores,
  sortFilmsByScore,
} from "../lib/profile-film-scoring.mjs";

dotenv.config({ path: ".env.local" });

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
  if (rating >= 8) return 0.8;
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

function getCentralityWeight(
  ratedFilm,
  ratedFilmsForCentrality,
  embeddingByFilmId
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
        return { signal: 0, filmId: otherFilm.id };
      }

      const similarity = cosineSimilarity(ratedEmbedding, otherEmbedding);

      return {
        signal: getEffectiveSimilarity(similarity),
        filmId: otherFilm.id,
      };
    })
    .filter((entry) => entry.signal > 0)
    .sort((a, b) => {
      if (b.signal !== a.signal) {
        return b.signal - a.signal;
      }

      return a.filmId.localeCompare(b.filmId);
    })
    .slice(0, 3)
    .map((entry) => entry.signal);

  if (neighborSignals.length === 0) {
    return 0.55;
  }

  const densityScore =
    neighborSignals.reduce((sum, signal) => sum + signal, 0) /
    neighborSignals.length;

  return 0.55 + densityScore * 0.45;
}

function getNearestRatedFilmsScore(
  candidateEmbedding,
  ratedFilms,
  embeddingByFilmId,
  centralityWeightByFilmId
) {
  if (!candidateEmbedding) {
    return 0;
  }

  const signals = ratedFilms
    .map((ratedFilm) => {
      const rating = Number(ratedFilm.rating ?? 0);
      const ratingWeight = getRatingWeight(rating);

      if (ratingWeight <= 0) {
        return { signal: 0, filmId: ratedFilm.id };
      }

      const ratedEmbedding = embeddingByFilmId.get(ratedFilm.id);

      if (!ratedEmbedding) {
        return { signal: 0, filmId: ratedFilm.id };
      }

      const similarity = cosineSimilarity(candidateEmbedding, ratedEmbedding);
      const effectiveSimilarity = getEffectiveSimilarity(similarity);
      const centralityWeight =
        centralityWeightByFilmId.get(ratedFilm.id) ?? 0.55;

      return {
        signal: effectiveSimilarity * ratingWeight * centralityWeight,
        filmId: ratedFilm.id,
      };
    })
    .filter((entry) => entry.signal > 0)
    .sort((a, b) => {
      if (b.signal !== a.signal) {
        return b.signal - a.signal;
      }

      return a.filmId.localeCompare(b.filmId);
    })
    .map((entry) => entry.signal);

  const bestSignal = signals[0] ?? 0;
  const secondSignal = signals[1] ?? 0;
  const thirdSignal = signals[2] ?? 0;

  return bestSignal + secondSignal * 0.15 + thirdSignal * 0.05;
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

function getEmotionalMatchScore(
  film,
  filmMoodEmbeddingByFilmId,
  moodCentralityWeightByFilmId,
  ratedFilms,
  emotionalProfileTagWeights
) {
  const filmEmbedding = filmMoodEmbeddingByFilmId.get(film.id);

  const nearestScore = getNearestRatedFilmsScore(
    filmEmbedding,
    ratedFilms,
    filmMoodEmbeddingByFilmId,
    moodCentralityWeightByFilmId
  );

  const profileScore = getProfileTagMatchScore(film, emotionalProfileTagWeights);

  return profileScore * 0.5 + nearestScore * 0.5;
}

function getMaterialMatchScore(
  film,
  filmAestheticEmbeddingByFilmId,
  aestheticCentralityWeightByFilmId,
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
    filmAestheticEmbeddingByFilmId,
    aestheticCentralityWeightByFilmId
  );

  return profileScore * 0.5 + nearestScore * 0.5;
}

async function getProfiles(profileSlug) {
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

async function getTasteCores(profileId) {
  const { data, error } = await supabase
    .from("profile_taste_cores")
    .select("*")
    .eq("profile_id", profileId)
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

async function getAllFilms() {
  const { data, error } = await supabase
    .from("films")
    .select("id, title, moods, aesthetic_tags, technique, year")
    .order("id");

  if (error) {
    throw error;
  }

  return data ?? [];
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

async function rebuildProfileScores(profile, allFilms) {
  console.log(`\nRebuilding scores for ${profile.slug} (${profile.name})`);

  const tasteCores = await getTasteCores(profile.id);
  const aestheticCores = tasteCores.filter(
    (core) => core.core_type === "aesthetic"
  );

  const emotionalCores = tasteCores.filter(
    (core) => core.core_type === "emotional"
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
  const ratedFilmIds = new Set(ratings.map((item) => item.film_id));

  const ratingByFilmId = new Map(
    ratings
      .filter((item) => item.rating !== null)
      .map((item) => [item.film_id, item.rating])
  );

  const ratedFilms = allFilms
    .map((film) => ({
      ...film,
      rating: ratingByFilmId.get(film.id) ?? null,
    }))
    .filter((film) => Number(film.rating ?? 0) >= 7)
    .sort(compareFilmsById);

  const candidateFilms = allFilms
    .filter((film) => !ratedFilmIds.has(film.id))
    .sort(compareFilmsById);

  if (!candidateFilms.length) {
    await upsertScores(profile.id, []);
    console.log("  No unrated films to score.");
    return;
  }

  const filmIds = allFilms.map((film) => film.id);

  const filmMoodEmbeddingByFilmId = await getFilmEmbeddings(
    "film_mood_embeddings",
    filmIds
  );
  const filmAestheticEmbeddingByFilmId = await getFilmEmbeddings(
    "film_aesthetic_embeddings",
    filmIds
  );

  const moodCentralityWeightByFilmId = new Map(
    ratedFilms.map((ratedFilm) => [
      ratedFilm.id,
      getCentralityWeight(ratedFilm, ratedFilms, filmMoodEmbeddingByFilmId),
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

  const computedAt = new Date().toISOString();
  const scoreRows = candidateFilms.map((film) => ({
    profile_id: profile.id,
    film_id: film.id,
    emotional_score: getEmotionalMatchScore(
      film,
      filmMoodEmbeddingByFilmId,
      moodCentralityWeightByFilmId,
      ratedFilms,
      emotionalProfileTagWeights
    ),
    material_score: getMaterialMatchScore(
      film,
      filmAestheticEmbeddingByFilmId,
      aestheticCentralityWeightByFilmId,
      ratedFilms,
      aestheticProfileTagWeights
    ),
    computed_at: computedAt,
  }));

  await upsertScores(profile.id, scoreRows);

  console.log(`  Stored ${scoreRows.length} film scores.`);

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

  const topFilms = sortFilmsByScore(candidateFilms, balancedScores).slice(0, 10);

  console.log("  Top 10 films:");

  topFilms.forEach((film, index) => {
    const score = balancedScores.get(film.id)?.balanced ?? 0;

    console.log(
      `    ${index + 1}. ${film.title} — ${score.toFixed(4)}`
    );
  });
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

main().catch((error) => {
  console.error("\nRebuild profile film scores failed.\n", error);
  process.exit(1);
});
