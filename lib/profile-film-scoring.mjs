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
