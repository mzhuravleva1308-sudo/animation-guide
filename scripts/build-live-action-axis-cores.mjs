/**
 * Live-action Visual World + Storytelling taste cores.
 * Built only from live_action ratings; never mixed into animation cores.
 */

import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { MEDIA_TYPE, normalizeMediaType } from "../lib/media-type.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

const MIN_RATING = 7;
const MIN_FILMS_IN_CORE = 3;
const FILM_SIMILARITY_THRESHOLD = 0.86;
const PROFILE_TAGS_LIMIT = 12;

const AXIS_CONFIG = Object.freeze({
  visual_world: {
    coreType: "visual_world",
    filmTagField: "visual_world_tags",
    profileTagField: "visual_world_profile_tags",
    embeddingTable: "film_visual_world_embeddings",
  },
  storytelling: {
    coreType: "storytelling",
    filmTagField: "storytelling_tags",
    profileTagField: "storytelling_profile_tags",
    embeddingTable: "film_storytelling_embeddings",
  },
});

function parseEmbedding(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(Number);
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

function buildClusters(films) {
  // Stable seed order: greedy clustering is order-dependent, so without a
  // fixed order the same likes can produce different cores on each rebuild.
  const ordered = [...films].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
  const clusters = [];
  const usedFilmIds = new Set();

  for (const film of ordered) {
    if (usedFilmIds.has(film.id)) continue;
    const cluster = [film];
    usedFilmIds.add(film.id);
    let changed = true;

    while (changed) {
      changed = false;
      const centerEmbedding = averageEmbeddings(
        cluster.map((clusterFilm) => clusterFilm.embedding)
      );
      for (const candidate of ordered) {
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
    .sort(
      (a, b) =>
        b.length - a.length ||
        String(a[0]?.id ?? "").localeCompare(String(b[0]?.id ?? ""))
    );
}

function frequencyTags(films, tagField) {
  const counts = new Map();
  for (const film of films) {
    for (const raw of film[tagField] ?? []) {
      const tag = String(raw ?? "")
        .trim()
        .toLowerCase();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PROFILE_TAGS_LIMIT)
    .map(([tag]) => tag);
}

async function getProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, slug")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function getFilmAxisEmbeddings(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select("film_id, embedding");
  if (error) throw error;
  const map = new Map();
  for (const row of data ?? []) {
    const embedding = parseEmbedding(row.embedding);
    if (embedding) map.set(row.film_id, embedding);
  }
  return map;
}

async function getRatedLiveActionFilms(profileId, tagField) {
  const { data, error } = await supabase
    .from("film_ratings")
    .select(
      `
      rating,
      films!inner (
        id,
        title,
        media_type,
        visual_world_tags,
        storytelling_tags
      )
    `
    )
    .eq("profile_id", profileId)
    .eq("films.media_type", MEDIA_TYPE.liveAction)
    .gte("rating", MIN_RATING);

  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      rating: row.rating,
      ...row.films,
      media_type: normalizeMediaType(row.films?.media_type, MEDIA_TYPE.liveAction),
    }))
    .filter((film) => film.id && (film[tagField] ?? []).length > 0);
}

export async function rebuildAxisTasteCoresForMedia(
  profile,
  axisKey,
  filmEmbeddings
) {
  const axis = AXIS_CONFIG[axisKey];
  if (!axis) throw new Error(`Unknown axis: ${axisKey}`);

  const mediaType = MEDIA_TYPE.liveAction;
  console.log(`\nProfile: ${profile.name} [${mediaType}/${axis.coreType}]`);

  const ratedFilms = await getRatedLiveActionFilms(
    profile.id,
    axis.filmTagField
  );
  const filmsWithEmbeddings = ratedFilms
    .map((film) => ({
      ...film,
      embedding: filmEmbeddings.get(film.id),
    }))
    .filter((film) => film.embedding);

  console.log(
    `High-rated films with embeddings: ${filmsWithEmbeddings.length}`
  );

  const { error: deleteError } = await supabase
    .from("profile_taste_cores")
    .delete()
    .eq("profile_id", profile.id)
    .eq("media_type", mediaType)
    .eq("core_type", axis.coreType);
  if (deleteError) throw deleteError;

  if (filmsWithEmbeddings.length < MIN_FILMS_IN_CORE) {
    console.log("Not enough films for cores");
    return;
  }

  let clusters = buildClusters(filmsWithEmbeddings);
  if (clusters.length === 0 && filmsWithEmbeddings.length > 0) {
    clusters = [filmsWithEmbeddings];
  }

  console.log(`Cores found: ${clusters.length}`);

  for (let index = 0; index < clusters.length; index += 1) {
    const cluster = clusters[index];
    const centerEmbedding = averageEmbeddings(
      cluster.map((film) => film.embedding)
    );
    const profileTags = frequencyTags(cluster, axis.filmTagField);
    const averageRating =
      cluster.reduce((sum, film) => sum + film.rating, 0) / cluster.length;
    const strength = Number((averageRating / 10).toFixed(3));
    const coverage = Number(
      (cluster.length / filmsWithEmbeddings.length).toFixed(3)
    );
    const maturity = cluster.length >= 3 ? "stable" : "emerging";

    const row = {
      profile_id: profile.id,
      media_type: mediaType,
      core_type: axis.coreType,
      core_index: index + 1,
      strength,
      average_rating: Number(averageRating.toFixed(2)),
      coverage,
      maturity,
      film_ids: cluster.map((film) => film.id),
      film_titles: cluster.map((film) => film.title),
      nearest_moods: profileTags,
      center_embedding: centerEmbedding,
      [axis.profileTagField]: profileTags,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profile_taste_cores").upsert(row, {
      onConflict: "profile_id,media_type,core_type,core_index",
    });
    if (error) throw error;

    console.log(`Core ${index + 1}:`);
    console.log(`  films: ${row.film_titles.join(", ")}`);
    console.log(`  tags: ${profileTags.join(", ")}`);
    console.log(`  strength: ${strength}`);
  }
}

export async function rebuildLiveActionAxisTasteCoresForProfile(
  profile,
  options = {}
) {
  const axes = options.axes ?? ["visual_world", "storytelling"];
  const embeddingCaches = options.embeddingCaches ?? {};

  for (const axisKey of axes) {
    const axis = AXIS_CONFIG[axisKey];
    const filmEmbeddings =
      embeddingCaches[axisKey] ??
      (await getFilmAxisEmbeddings(axis.embeddingTable));
    await rebuildAxisTasteCoresForMedia(profile, axisKey, filmEmbeddings);
  }
}

async function main() {
  const profiles = await getProfiles();
  const visualWorldEmbeddings = await getFilmAxisEmbeddings(
    AXIS_CONFIG.visual_world.embeddingTable
  );
  const storytellingEmbeddings = await getFilmAxisEmbeddings(
    AXIS_CONFIG.storytelling.embeddingTable
  );

  console.log(`Profiles: ${profiles.length}`);
  console.log(`Visual world embeddings: ${visualWorldEmbeddings.size}`);
  console.log(`Storytelling embeddings: ${storytellingEmbeddings.size}`);

  for (const profile of profiles) {
    await rebuildLiveActionAxisTasteCoresForProfile(profile, {
      embeddingCaches: {
        visual_world: visualWorldEmbeddings,
        storytelling: storytellingEmbeddings,
      },
    });
  }

  console.log("\nDone");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
