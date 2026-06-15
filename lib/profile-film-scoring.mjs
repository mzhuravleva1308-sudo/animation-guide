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

export function logColdStartDiagnostics(
  profile,
  ratings,
  candidates,
  sortedFilms
) {
  const likedHighRatedCount = (ratings ?? []).filter(
    (rating) => Number(rating.rating) >= 7
  ).length;
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
