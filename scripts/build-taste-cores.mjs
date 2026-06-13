import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

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

const MIN_RATING = 8;
const MIN_FILMS_IN_CORE = 3;
const FILM_SIMILARITY_THRESHOLD = 0.86;
const NEAREST_MOODS_LIMIT = 12;

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

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function averageEmbeddings(embeddings) {
  if (embeddings.length === 0) return null;

  const size = embeddings[0].length;
  const result = Array(size).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < size; i += 1) {
      result[i] += embedding[i];
    }
  }

  return result.map((value) => value / embeddings.length);
}

function normalizeMood(mood) {
  return mood.trim().toLowerCase();
}

async function getMoodEmbeddings() {
  const { data, error } = await supabase
    .from("mood_embeddings")
    .select("mood, embedding");

  if (error) throw error;

  const map = new Map();

  for (const row of data ?? []) {
    const embedding = parseEmbedding(row.embedding);

    if (embedding) {
      map.set(normalizeMood(row.mood), embedding);
    }
  }

  return map;
}

async function getFilmMoodEmbeddings() {
  const { data, error } = await supabase
    .from("film_mood_embeddings")
    .select("film_id, embedding");

  if (error) throw error;

  const map = new Map();

  for (const row of data ?? []) {
    const embedding = parseEmbedding(row.embedding);

    if (embedding) {
      map.set(row.film_id, embedding);
    }
  }

  return map;
}

function buildClusters(films) {
  const clusters = [];
  const usedFilmIds = new Set();

  for (const film of films) {
    if (usedFilmIds.has(film.id)) continue;

    const cluster = [film];
    usedFilmIds.add(film.id);

    let changed = true;

    while (changed) {
      changed = false;

      const centerEmbedding = averageEmbeddings(
        cluster.map((clusterFilm) => clusterFilm.embedding)
      );

      for (const candidate of films) {
        if (usedFilmIds.has(candidate.id)) continue;

        const similarityToCenter = cosineSimilarity(
          candidate.embedding,
          centerEmbedding
        );

        if (similarityToCenter >= FILM_SIMILARITY_THRESHOLD) {
          cluster.push(candidate);
          usedFilmIds.add(candidate.id);
          changed = true;
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters
    .filter((cluster) => cluster.length >= MIN_FILMS_IN_CORE)
    .sort((a, b) => b.length - a.length);
}

function getNearestMoods(centerEmbedding, moodEmbeddings) {
  return Array.from(moodEmbeddings.entries())
    .map(([mood, embedding]) => ({
      mood,
      similarity: cosineSimilarity(centerEmbedding, embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, NEAREST_MOODS_LIMIT)
    .map((item) => item.mood);
}

async function getProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, slug")
    .order("name");

  if (error) throw error;

  return data ?? [];
}

async function getRatedFilms(profileId) {
  const { data, error } = await supabase
    .from("film_ratings")
    .select(`
      rating,
      films (
        id,
        title,
        moods
      )
    `)
    .eq("profile_id", profileId)
    .gte("rating", MIN_RATING);

  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      rating: row.rating,
      ...row.films,
    }))
    .filter((film) => film.id && film.moods?.length);
}

async function rebuildProfileCores(profile, moodEmbeddings, filmMoodEmbeddings) {
  console.log(`\nProfile: ${profile.name}`);

  const ratedFilms = await getRatedFilms(profile.id);

  const filmsWithEmbeddings = ratedFilms
    .map((film) => ({
      ...film,
      embedding: filmMoodEmbeddings.get(film.id),
    }))
    .filter((film) => film.embedding);

  console.log(`High-rated films with embeddings: ${filmsWithEmbeddings.length}`);

  const { error: deleteError } = await supabase
    .from("profile_taste_cores")
    .delete()
    .eq("profile_id", profile.id)
    .eq("core_type", "emotional");

  if (deleteError) throw deleteError;

  if (filmsWithEmbeddings.length < MIN_FILMS_IN_CORE) {
    console.log("Not enough films for cores");
    return;
  }

  const clusters = buildClusters(filmsWithEmbeddings);

  if (clusters.length === 0 && filmsWithEmbeddings.length > 0) {
    clusters.push(filmsWithEmbeddings);
  }
  
  console.log(`Cores found: ${clusters.length}`);

  for (let index = 0; index < clusters.length; index += 1) {
    const cluster = clusters[index];

    const centerEmbedding = averageEmbeddings(
      cluster.map((film) => film.embedding)
    );

    const nearestMoods = getNearestMoods(centerEmbedding, moodEmbeddings);

    const averageRating =
      cluster.reduce((sum, film) => sum + film.rating, 0) / cluster.length;

    const strength = Number((averageRating / 10).toFixed(3));

    const coverage = Number(
      (cluster.length / filmsWithEmbeddings.length).toFixed(3)
    );

    const maturity = cluster.length >= 3 ? "stable" : "emerging";

    const row = {
      profile_id: profile.id,
      core_type: "emotional",
      core_index: index + 1,
      strength,
      average_rating: Number(averageRating.toFixed(2)),
      coverage,
      maturity,
      film_ids: cluster.map((film) => film.id),
      film_titles: cluster.map((film) => film.title),
      nearest_moods: nearestMoods,
      center_embedding: centerEmbedding,
      emotional_profile_tags: nearestMoods,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("profile_taste_cores")
      .upsert(row, {
        onConflict: "profile_id,core_type,core_index",
      });

    if (error) throw error;

    console.log(`Core ${index + 1}:`);
    console.log(`  films: ${row.film_titles.join(", ")}`);
    console.log(`  moods: ${row.nearest_moods.join(", ")}`);
    console.log(`  strength: ${strength}`);
  }
}

async function main() {
  const moodEmbeddings = await getMoodEmbeddings();
  const filmMoodEmbeddings = await getFilmMoodEmbeddings();
  const profiles = await getProfiles();

  console.log(`Mood embeddings: ${moodEmbeddings.size}`);
  console.log(`Film mood embeddings: ${filmMoodEmbeddings.size}`);
  console.log(`Profiles: ${profiles.length}`);

  for (const profile of profiles) {
    await rebuildProfileCores(profile, moodEmbeddings, filmMoodEmbeddings);
  }

  console.log("\nDone");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});