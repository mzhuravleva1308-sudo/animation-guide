export function normalizeMatchScore(score, range) {
  const normalized = (score - range.min) / (range.max - range.min);

  return Math.max(0, Math.min(1, normalized));
}

export function getScoreRange(scores) {
  const sortedScores = scores
    .filter((score) => Number.isFinite(score))
    .sort((a, b) => a - b);

  if (sortedScores.length === 0) {
    return { min: 0, max: 1 };
  }

  const min = sortedScores[0] ?? 0;
  const max = sortedScores[sortedScores.length - 1] ?? 1;

  if (max <= min) {
    return { min: 0, max: 1 };
  }

  return { min, max };
}

export function buildBalancedScores(films, rawScoresByFilmId) {
  const filmScoresById = new Map();

  const emotionalScores = films.map(
    (film) => rawScoresByFilmId.get(film.id)?.emotional ?? 0
  );
  const materialScores = films.map(
    (film) => rawScoresByFilmId.get(film.id)?.material ?? 0
  );

  const emotionalScoreRange = getScoreRange(emotionalScores);
  const materialScoreRange = getScoreRange(materialScores);

  films.forEach((film, index) => {
    const emotional = emotionalScores[index] ?? 0;
    const material = materialScores[index] ?? 0;
    const normalizedEmotional = normalizeMatchScore(
      emotional,
      emotionalScoreRange
    );
    const normalizedMaterial = normalizeMatchScore(
      material,
      materialScoreRange
    );

    filmScoresById.set(film.id, {
      emotional,
      material,
      balanced: normalizedEmotional * 0.5 + normalizedMaterial * 0.5,
    });
  });

  return filmScoresById;
}

export function compareFilmsByScore(a, b, scoreA, scoreB) {
  const balancedA = scoreA?.balanced ?? 0;
  const balancedB = scoreB?.balanced ?? 0;
  const scoreDifference = balancedB - balancedA;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const signalDifference =
    (scoreB?.matchedSignalCount ?? 0) - (scoreA?.matchedSignalCount ?? 0);

  if (signalDifference !== 0) {
    return signalDifference;
  }

  const titleDifference = (a.title ?? "").localeCompare(b.title ?? "", "en", {
    sensitivity: "base",
  });

  if (titleDifference !== 0) {
    return titleDifference;
  }

  return a.id.localeCompare(b.id);
}

export function sortFilmsByScore(films, filmScoresById) {
  return [...films].sort((a, b) =>
    compareFilmsByScore(a, b, filmScoresById.get(a.id), filmScoresById.get(b.id))
  );
}

export const COLD_START_LOOK_AHEAD = 6;

const COLD_START_DIVERSITY_FIELDS = ["director", "technique", "country"];

export function compareFilmsByTitleAndId(a, b) {
  const titleDifference = (a.title ?? "").localeCompare(b.title ?? "", "en", {
    sensitivity: "base",
  });

  if (titleDifference !== 0) {
    return titleDifference;
  }

  return (a.id ?? "").localeCompare(b.id ?? "");
}

export function compareColdStartScoredFilms(a, b) {
  const scoreA = a.cold_start_score ?? Number.NEGATIVE_INFINITY;
  const scoreB = b.cold_start_score ?? Number.NEGATIVE_INFINITY;
  const scoreDifference = scoreB - scoreA;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return compareFilmsByTitleAndId(a, b);
}

function normalizeDiversityValue(value) {
  if (value == null) {
    return null;
  }

  const normalized =
    typeof value === "string" ? value.trim() : String(value).trim();

  return normalized || null;
}

function filmRepeatsPreviousFilm(film, previousFilm, diversityFields) {
  if (!previousFilm) {
    return false;
  }

  for (const field of diversityFields) {
    const current = normalizeDiversityValue(film[field]);
    const previous = normalizeDiversityValue(previousFilm[field]);

    if (
      current &&
      previous &&
      current.toLowerCase() === previous.toLowerCase()
    ) {
      return true;
    }
  }

  return false;
}

export function diversityRerankColdStartFilms(
  films,
  lookAhead = COLD_START_LOOK_AHEAD
) {
  const remaining = [...films];
  const result = [];

  while (remaining.length > 0) {
    const previous = result[result.length - 1] ?? null;
    const windowSize = Math.min(lookAhead, remaining.length);
    let pickIndex = 0;

    for (let index = 0; index < windowSize; index += 1) {
      if (
        !filmRepeatsPreviousFilm(
          remaining[index],
          previous,
          COLD_START_DIVERSITY_FIELDS
        )
      ) {
        pickIndex = index;
        break;
      }
    }

    result.push(remaining[pickIndex]);
    remaining.splice(pickIndex, 1);
  }

  return result;
}

export function sortFilmsByColdStart(films) {
  const scoredFilms = films.filter((film) => film.cold_start_score != null);
  const unscoredFilms = films.filter((film) => film.cold_start_score == null);

  const scoredSorted = [...scoredFilms].sort(compareColdStartScoredFilms);
  const scoredReranked = diversityRerankColdStartFilms(scoredSorted);
  const unscoredSorted = [...unscoredFilms].sort(compareFilmsByTitleAndId);

  return [...scoredReranked, ...unscoredSorted];
}

/** Ratings at or above this threshold unlock smart (liked-film) catalog sorting. */
export const LIKED_HIGH_RATING_THRESHOLD = 7;

export function countLikedHighRatings(ratings) {
  return (ratings ?? []).filter(
    (item) => Number(item.rating) >= LIKED_HIGH_RATING_THRESHOLD
  ).length;
}

/**
 * Unlock ratings for a score artifact:
 * - native: likes in the catalog media
 * - cross_media: likes in the source media (other catalog)
 *
 * @param {Array<{ film_id?: string, rating?: number, media_type?: string | null }>} ratings
 * @param {{ scoreMode?: string, sourceMedia?: string, mediaType?: string }} options
 */
export function countLikedHighRatingsForRanking(ratings, options = {}) {
  const scoreMode = options.scoreMode ?? "native";
  const unlockMedia =
    scoreMode === "cross_media"
      ? options.sourceMedia
      : options.mediaType ?? options.sourceMedia;

  if (!unlockMedia) {
    return countLikedHighRatings(ratings);
  }

  return (ratings ?? []).filter((item) => {
    if (Number(item.rating) < LIKED_HIGH_RATING_THRESHOLD) return false;
    if (item.media_type == null) return true;
    return item.media_type === unlockMedia;
  }).length;
}

export function buildRawFilmScoresById(scoreRows) {
  return new Map(
    (scoreRows ?? []).map((row) => [
      row.film_id,
      {
        emotional: Number(row.emotional_score ?? 0),
        material: Number(row.material_score ?? 0),
      },
    ])
  );
}

/**
 * Dual-mode catalog ranking from the retired profile page.
 * Reuses sortFilmsByColdStart / buildBalancedScores / sortFilmsByScore as-is.
 * Does not filter rated films — pass unrated candidates to match legacy behavior.
 *
 * @param {{
 *   films: Array<object>,
 *   viewer: "guest" | "authenticated",
 *   ratings?: Array<{ film_id?: string, rating?: number, media_type?: string }>,
 *   scoreRows?: Array<{
 *     film_id: string,
 *     emotional_score?: number | null,
 *     material_score?: number | null,
 *   }> | null,
 *   scoresUnavailable?: boolean,
 *   scoreMode?: string,
 *   sourceMedia?: string,
 *   mediaType?: string,
 * }} options
 */
export function sortFilmsForDualModeCatalog({
  films,
  viewer,
  ratings = [],
  scoreRows = null,
  scoresUnavailable = false,
  scoreMode = "native",
  sourceMedia,
  mediaType,
}) {
  if (viewer !== "authenticated") {
    return {
      films: sortFilmsByColdStart(films),
      mode: "cold-start",
      reason: "guest",
      scoresFallbackCause: null,
    };
  }

  if (
    countLikedHighRatingsForRanking(ratings, {
      scoreMode,
      sourceMedia,
      mediaType,
    }) === 0
  ) {
    return {
      films: sortFilmsByColdStart(films),
      mode: "cold-start",
      reason: "no-high-ratings",
      scoresFallbackCause: null,
    };
  }

  if (scoresUnavailable) {
    return {
      films: sortFilmsByColdStart(films),
      mode: "cold-start",
      reason: "smart-scores-unavailable",
      scoresFallbackCause: "query-error",
    };
  }

  if (!Array.isArray(scoreRows) || scoreRows.length === 0) {
    return {
      films: sortFilmsByColdStart(films),
      mode: "cold-start",
      reason: "smart-scores-unavailable",
      scoresFallbackCause: "empty-scores",
    };
  }

  const rawScoresByFilmId = buildRawFilmScoresById(scoreRows);
  const balancedScores = buildBalancedScores(films, rawScoresByFilmId);

  return {
    films: sortFilmsByScore(films, balancedScores),
    mode: scoreMode === "cross_media" ? "smart-cross" : "smart",
    reason: "profile-scores",
    scoresFallbackCause: null,
  };
}

export function logColdStartDiagnostics(
  profile,
  ratings,
  candidates,
  sortedFilms
) {
  const likedHighRatedCount = countLikedHighRatings(ratings);
  const scoredFilmsCount = candidates.filter(
    (film) => film.cold_start_score != null
  ).length;
  const remainingUnscoredCount = candidates.filter(
    (film) => film.cold_start_score == null
  ).length;
  const top20ColdStartOrder = sortedFilms
    .filter((film) => film.cold_start_score != null)
    .slice(0, 20)
    .map((film) => ({
      title: film.title,
      director: film.director ?? null,
      country: film.country ?? null,
      technique: film.technique ?? null,
      cold_start_score: film.cold_start_score,
    }));

  console.info("[cold-start] mode active", {
    profileSlug: profile.slug,
    profileName: profile.name,
    likedHighRatedCount,
    scoredFilmsCount,
    remainingUnscoredCount,
    top20ColdStartOrder,
  });
}
