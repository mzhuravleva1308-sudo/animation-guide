/**
 * Live-action catalog rerank: each like ≥7 pulls its nearest unused neighbor
 * by equal-weight mood × visual world × storytelling similarity to that like.
 * Does not write profile_film_scores; used only at catalog sort time.
 */

export const PER_LIKE_TOP_N = 15;
export const PAIR_MIN_SIMILARITY = 0.72;

export function sortLikesForPull(likes) {
  return [...(likes ?? [])].sort(
    (a, b) =>
      Number(b.rating ?? 0) - Number(a.rating ?? 0) ||
      String(a.title ?? "").localeCompare(String(b.title ?? "")) ||
      String(a.id).localeCompare(String(b.id))
  );
}

export function ratingWeight(rating) {
  if (rating >= 10) return 1;
  if (rating >= 9) return 0.9;
  if (rating >= 8) return 0.75;
  if (rating >= 7) return 0.55;
  return 0;
}

export function effectiveSimilarity(
  similarity,
  minSimilarity = PAIR_MIN_SIMILARITY
) {
  if (!Number.isFinite(similarity) || similarity <= minSimilarity) {
    return 0;
  }
  return (similarity - minSimilarity) / (1 - minSimilarity);
}

/**
 * Equal-weight score of a candidate against one like on the given axis
 * similarities, then optional profileGate.
 */
export function axesScoreAgainstLike({ sims, likeRating, profileGate = 1 }) {
  const values = (sims ?? []).filter((sim) => Number.isFinite(sim));
  if (!values.length) {
    return 0;
  }
  const weight = ratingWeight(likeRating);
  const average =
    values.reduce((sum, sim) => sum + effectiveSimilarity(sim) * weight, 0) /
    values.length;
  return average * Number(profileGate ?? 1);
}

/**
 * 3-axis score of a candidate against one like only (equal thirds).
 */
export function threeAxisScoreAgainstLike({
  emotionalSim,
  visualWorldSim,
  storytellingSim,
  likeRating,
  profileGate = 1,
}) {
  return axesScoreAgainstLike({
    sims: [emotionalSim, visualWorldSim, storytellingSim],
    likeRating,
    profileGate,
  });
}

export function parseEmbedding(value) {
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

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
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

/**
 * Each like pulls the unused candidate with the highest pair score against
 * that like. Remaining films keep baseline balanced order.
 */
export function rankPerLikeByPairScore({
  likes,
  candidates,
  scoreAgainstLike,
  tailScores,
  limit = PER_LIKE_TOP_N,
}) {
  const likesOrdered = sortLikesForPull(likes);
  const used = new Set();
  const pulled = [];

  const pickBestForLike = (like) => {
    let best = null;
    let bestScore = -Infinity;
    for (const film of candidates) {
      if (used.has(film.id)) {
        continue;
      }
      const score = scoreAgainstLike(film, like);
      if (
        score > bestScore ||
        (score === bestScore &&
          best &&
          (String(film.title ?? "").localeCompare(String(best.title ?? "")) <
            0 ||
            (film.title === best.title &&
              String(film.id).localeCompare(String(best.id)) < 0)))
      ) {
        best = film;
        bestScore = score;
      }
    }
    return best ? { film: best, pairScore: bestScore } : null;
  };

  let progressed = true;
  while (pulled.length < limit && progressed) {
    progressed = false;
    for (const like of likesOrdered) {
      if (pulled.length >= limit) {
        break;
      }
      const picked = pickBestForLike(like);
      if (!picked) {
        continue;
      }
      used.add(picked.film.id);
      pulled.push({
        film: picked.film,
        pulledBy: like,
        pairScore: picked.pairScore,
      });
      progressed = true;
    }
  }

  const tail = (tailScores
    ? [...candidates].sort((a, b) => {
        const scoreA = tailScores.get(a.id)?.balanced ?? 0;
        const scoreB = tailScores.get(b.id)?.balanced ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (
          String(a.title ?? "").localeCompare(String(b.title ?? "")) ||
          String(a.id).localeCompare(String(b.id))
        );
      })
    : candidates
  ).filter((film) => !used.has(film.id));

  return {
    films: [...pulled.map((row) => row.film), ...tail],
    pulled,
  };
}

/**
 * Build live-action per-like scoreAgainstLike from embedding maps.
 * profileGate defaults to 1 (gate already shapes stored axis scores / tail).
 */
export function buildLiveActionScoreAgainstLike({
  moodByFilmId,
  visualWorldByFilmId,
  storytellingByFilmId,
  profileGateByFilmId,
}) {
  return (candidate, like) =>
    threeAxisScoreAgainstLike({
      emotionalSim: cosineSimilarity(
        moodByFilmId.get(candidate.id),
        moodByFilmId.get(like.id)
      ),
      visualWorldSim: cosineSimilarity(
        visualWorldByFilmId.get(candidate.id),
        visualWorldByFilmId.get(like.id)
      ),
      storytellingSim: cosineSimilarity(
        storytellingByFilmId.get(candidate.id),
        storytellingByFilmId.get(like.id)
      ),
      likeRating: like.rating,
      profileGate: profileGateByFilmId?.get(candidate.id) ?? 1,
    });
}

export function perLikePullLimit(likeCount) {
  const n = Number(likeCount) || 0;
  return Math.max(PER_LIKE_TOP_N, n);
}
