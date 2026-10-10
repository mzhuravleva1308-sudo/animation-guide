/**
 * Personalized "New for you" picks: recent catalog arrivals ranked by taste.
 */

import {
  buildBalancedScores,
  buildRawFilmScoresById,
  countLikedHighRatingsForRanking,
  sortFilmsByScore,
} from "./profile-film-scoring.mjs";

/** Rolling window for "just landed in the catalog". */
export const FRESH_TASTE_PICKS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Max cards in the New for you strip. */
export const FRESH_TASTE_PICKS_LIMIT = 2;

/**
 * Second pick only if its balanced score is at least this fraction of #1.
 * Balanced scores are 0–1 (min-max over the unrated catalog). First pick is
 * always shown when the pool is non-empty; #2 is optional.
 */
export const FRESH_TASTE_PICKS_SECOND_MIN_RATIO = 0.85;

/**
 * @param {unknown} email
 * @returns {string}
 */
export function normalizeFreshTastePicksEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Available to all signed-in catalog viewers. Selection still requires
 * smart-ranking gates (high ratings + scores) inside selectFreshTastePicks.
 * @param {{ email?: string | null } | null | undefined} viewer
 * @returns {boolean}
 */
export function canAccessFreshTastePicks(viewer) {
  return Boolean(normalizeFreshTastePicksEmail(viewer?.email));
}

/** @deprecated Allowlist retired; New for you is generally available. */
export const FRESH_TASTE_PICKS_ALLOWLIST_EMAILS = Object.freeze([]);

/**
 * @param {number} [nowMs]
 * @returns {string} ISO lower bound for the appearance window
 */
export function freshTastePicksSinceIso(nowMs = Date.now()) {
  return new Date(nowMs - FRESH_TASTE_PICKS_WINDOW_MS).toISOString();
}

/**
 * Merge release-batch + direct-import appearance id lists.
 * @param {Iterable<string | null | undefined> | null | undefined} fromBatches
 * @param {Iterable<string | null | undefined> | null | undefined} fromCreatedAt
 * @returns {Set<string>}
 */
export function mergeRecentCatalogFilmIds(fromBatches, fromCreatedAt) {
  const ids = new Set();
  for (const source of [fromBatches, fromCreatedAt]) {
    if (!source) continue;
    for (const id of source) {
      if (typeof id === "string" && id) {
        ids.add(id);
      }
    }
  }
  return ids;
}

/**
 * Whether a runner-up is close enough to the top pick to show beside it.
 * @param {number} topBalanced
 * @param {number} secondBalanced
 * @param {number} [minRatio]
 * @returns {boolean}
 */
export function isSecondFreshPickCloseEnough(
  topBalanced,
  secondBalanced,
  minRatio = FRESH_TASTE_PICKS_SECOND_MIN_RATIO
) {
  const top = Number(topBalanced);
  const second = Number(secondBalanced);
  if (!Number.isFinite(top) || !Number.isFinite(second)) {
    return false;
  }
  if (top <= 0) {
    return second >= top;
  }
  return second / top >= minRatio;
}

/**
 * Pick top unrated recent films by balanced personal score.
 * Always returns the best recent match (when gated in); a second card only
 * when its score is within {@link FRESH_TASTE_PICKS_SECOND_MIN_RATIO} of #1.
 *
 * @param {{
 *   films: Array<{ id: string, title?: string | null }>,
 *   recentFilmIds: Set<string> | Iterable<string>,
 *   ratings?: Array<{ film_id?: string, rating?: number, media_type?: string }>,
 *   scoreRows?: Array<{
 *     film_id: string,
 *     emotional_score?: number | null,
 *     material_score?: number | null,
 *     visual_world_score?: number | null,
 *     storytelling_score?: number | null,
 *   }> | null,
 *   scoresUnavailable?: boolean,
 *   scoreMode?: string,
 *   sourceMedia?: string,
 *   mediaType?: string,
 *   limit?: number,
 *   secondMinRatio?: number,
 * }} options
 * @returns {Array<object>}
 */
export function selectFreshTastePicks({
  films,
  recentFilmIds,
  ratings = [],
  scoreRows = null,
  scoresUnavailable = false,
  scoreMode = "native",
  sourceMedia,
  mediaType,
  limit = FRESH_TASTE_PICKS_LIMIT,
  secondMinRatio = FRESH_TASTE_PICKS_SECOND_MIN_RATIO,
} = {}) {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  if (max === 0 || !Array.isArray(films) || films.length === 0) {
    return [];
  }

  if (
    countLikedHighRatingsForRanking(ratings, {
      scoreMode,
      sourceMedia,
      mediaType,
    }) === 0
  ) {
    return [];
  }

  if (scoresUnavailable || !Array.isArray(scoreRows) || scoreRows.length === 0) {
    return [];
  }

  const recentIds =
    recentFilmIds instanceof Set
      ? recentFilmIds
      : new Set(
          [...(recentFilmIds ?? [])].filter(
            (id) => typeof id === "string" && id
          )
        );

  if (recentIds.size === 0) {
    return [];
  }

  const pool = films.filter((film) => film?.id && recentIds.has(film.id));
  if (pool.length === 0) {
    return [];
  }

  // Score against the full unrated catalog so closeness is meaningful
  // (pool-only min-max would stretch near-ties to 1.0 vs 0.0).
  const rawScoresByFilmId = buildRawFilmScoresById(scoreRows);
  const balancedScores = buildBalancedScores(films, rawScoresByFilmId, {
    mediaType,
    scoreMode,
  });

  const ranked = sortFilmsByScore(pool, balancedScores);
  const top = ranked[0];
  if (!top) {
    return [];
  }

  const picks = [top];
  if (max < 2) {
    return picks;
  }

  const second = ranked[1];
  if (!second) {
    return picks;
  }

  const topBalanced = balancedScores.get(top.id)?.balanced ?? 0;
  const secondBalanced = balancedScores.get(second.id)?.balanced ?? 0;
  if (isSecondFreshPickCloseEnough(topBalanced, secondBalanced, secondMinRatio)) {
    picks.push(second);
  }

  return picks;
}
