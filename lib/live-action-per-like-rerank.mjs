/**
 * Load mood / visual-world / storytelling embeddings for live-action per-like rerank.
 */

import {
  buildLiveActionScoreAgainstLike,
  parseEmbedding,
} from "./per-like-catalog-ranking.mjs";

async function loadEmbeddingMap(supabase, tableName, filmIds) {
  const map = new Map();
  if (!filmIds.length) {
    return map;
  }

  for (let i = 0; i < filmIds.length; i += 200) {
    const chunk = filmIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from(tableName)
      .select("film_id, embedding")
      .in("film_id", chunk);
    if (error) {
      throw error;
    }
    for (const row of data ?? []) {
      const embedding = parseEmbedding(row.embedding);
      if (embedding) {
        map.set(row.film_id, embedding);
      }
    }
  }

  return map;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} filmIds
 */
export async function loadLiveActionAxisEmbeddings(supabase, filmIds) {
  const uniqueIds = [...new Set((filmIds ?? []).filter(Boolean))];
  const [moodByFilmId, visualWorldByFilmId, storytellingByFilmId] =
    await Promise.all([
      loadEmbeddingMap(supabase, "film_mood_embeddings", uniqueIds),
      loadEmbeddingMap(supabase, "film_visual_world_embeddings", uniqueIds),
      loadEmbeddingMap(supabase, "film_storytelling_embeddings", uniqueIds),
    ]);

  return { moodByFilmId, visualWorldByFilmId, storytellingByFilmId };
}

/**
 * Build perLikeRerank input for sortFilmsForDualModeCatalog, or null on failure / empty.
 *
 * @param {{
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   candidateFilms: Array<{ id: string, title?: string }>,
 *   likes: Array<{ id: string, title?: string, rating: number }>,
 * }} args
 */
export async function buildLiveActionPerLikeRerank({
  supabase,
  candidateFilms,
  likes,
}) {
  if (!likes?.length || !candidateFilms?.length) {
    return null;
  }

  try {
    const embedIds = [
      ...new Set([
        ...likes.map((like) => like.id),
        ...candidateFilms.map((film) => film.id),
      ]),
    ];
    const embeddings = await loadLiveActionAxisEmbeddings(supabase, embedIds);
    return {
      likes,
      scoreAgainstLike: buildLiveActionScoreAgainstLike(embeddings),
    };
  } catch (error) {
    console.error("[catalog] live-action per-like embeddings unavailable", error);
    return null;
  }
}
