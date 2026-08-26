/**
 * Offline ranking variants for the per-like experiment.
 * Production pair-score pull lives in per-like-catalog-ranking.mjs.
 */

import { sortFilmsByScore } from "./profile-film-scoring.mjs";
import {
  PER_LIKE_TOP_N,
  axesScoreAgainstLike,
  rankPerLikeByPairScore,
  ratingWeight,
  effectiveSimilarity,
  sortLikesForPull,
  threeAxisScoreAgainstLike,
} from "./per-like-catalog-ranking.mjs";

export const TOP_N = PER_LIKE_TOP_N;
export const SAME_ANCHOR_WINDOW = 7;
export const SAME_ANCHOR_MAX = 2;

export {
  axesScoreAgainstLike,
  rankPerLikeByPairScore,
  ratingWeight,
  effectiveSimilarity,
  sortLikesForPull,
  threeAxisScoreAgainstLike,
};

export function likeIdsOnAnyAxis(gated) {
  return new Set(
    [
      gated?.emotionalAnchor?.anchorFilmId,
      gated?.visualWorldAnchor?.anchorFilmId,
      gated?.storytellingAnchor?.anchorFilmId,
    ].filter(Boolean)
  );
}

export function primaryAnchorId(gated) {
  return gated?.emotionalAnchor?.anchorFilmId ?? null;
}

export function rankBaseline(films, balancedScores) {
  return sortFilmsByScore(films, balancedScores);
}

/**
 * Baseline order, but in the first `windowSize` slots at most `maxPerAnchor`
 * films may share the same emotional nearest-anchor.
 */
export function rankSameAnchorCap(
  films,
  balancedScores,
  gatedById,
  {
    windowSize = SAME_ANCHOR_WINDOW,
    maxPerAnchor = SAME_ANCHOR_MAX,
  } = {}
) {
  const sorted = rankBaseline(films, balancedScores);
  const taken = [];
  const skipped = [];
  const remaining = [];

  for (const film of sorted) {
    if (taken.length >= windowSize) {
      remaining.push(film);
      continue;
    }

    const anchor = primaryAnchorId(gatedById.get(film.id));
    const already = taken.filter(
      (takenFilm) =>
        primaryAnchorId(gatedById.get(takenFilm.id)) === anchor &&
        Boolean(anchor)
    ).length;

    if (anchor && already >= maxPerAnchor) {
      skipped.push(film);
    } else {
      taken.push(film);
    }
  }

  return [...taken, ...skipped, ...remaining];
}

function compareNeighbors(a, b, balancedScores) {
  const scoreA = balancedScores.get(a.id)?.balanced ?? 0;
  const scoreB = balancedScores.get(b.id)?.balanced ?? 0;
  if (scoreB !== scoreA) {
    return scoreB - scoreA;
  }
  return (
    String(a.title ?? "").localeCompare(String(b.title ?? "")) ||
    String(a.id).localeCompare(String(b.id))
  );
}

/**
 * Round-robin: each like ≥7 pulls one unused neighbor per lap until `limit`.
 * Prefer candidates whose nearest-anchor on any axis is that like; otherwise
 * highest similarity to the like (so a 9 cannot keep every slot).
 */
export function rankPerLikeInterleave({
  likes,
  candidates,
  balancedScores,
  gatedById,
  similarityToLike,
  limit = TOP_N,
}) {
  const likesOrdered = sortLikesForPull(likes);
  const used = new Set();
  const pulled = [];

  const pickBestForLike = (like) => {
    const unused = candidates.filter((film) => !used.has(film.id));
    if (!unused.length) {
      return null;
    }

    const anchored = unused.filter((film) =>
      likeIdsOnAnyAxis(gatedById.get(film.id)).has(like.id)
    );

    if (anchored.length) {
      const rankedAnchored = [...anchored].sort((a, b) =>
        compareNeighbors(a, b, balancedScores)
      );
      return rankedAnchored[0] ?? null;
    }

    const rankedSimilar = [...unused].sort((a, b) => {
      const simA = similarityToLike(a.id, like.id);
      const simB = similarityToLike(b.id, like.id);
      if (simB !== simA) {
        return simB - simA;
      }
      return compareNeighbors(a, b, balancedScores);
    });
    return rankedSimilar[0] ?? null;
  };

  let progressed = true;
  while (pulled.length < limit && progressed) {
    progressed = false;
    for (const like of likesOrdered) {
      if (pulled.length >= limit) {
        break;
      }
      const film = pickBestForLike(like);
      if (!film) {
        continue;
      }
      used.add(film.id);
      pulled.push({
        film,
        pulledBy: like,
        viaAnchor: likeIdsOnAnyAxis(gatedById.get(film.id)).has(like.id),
      });
      progressed = true;
    }
  }

  const tail = rankBaseline(candidates, balancedScores).filter(
    (film) => !used.has(film.id)
  );

  return {
    films: [...pulled.map((row) => row.film), ...tail],
    pulled,
  };
}

export function uniqueAnchorsInTop(films, gatedById, n) {
  const ids = new Set();
  const titles = new Set();
  for (const film of films.slice(0, n)) {
    const gated = gatedById.get(film.id);
    const id = primaryAnchorId(gated);
    if (id) {
      ids.add(id);
    }
    const title = gated?.emotionalAnchor?.anchorTitle;
    if (title) {
      titles.add(title);
    }
  }
  return { ids, titles };
}
