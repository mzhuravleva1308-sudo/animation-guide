export type RawFilmScore = {
  emotional: number;
  material: number;
};

export type FilmScore = RawFilmScore & {
  balanced: number;
};

export function normalizeMatchScore(
  score: number,
  range: { min: number; max: number }
) {
  const normalized = (score - range.min) / (range.max - range.min);

  return Math.max(0, Math.min(1, normalized));
}

export function getScoreRange(scores: number[]) {
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

export function buildBalancedScores(
  films: Array<{ id: string }>,
  rawScoresByFilmId: Map<string, RawFilmScore>
) {
  const filmScoresById = new Map<string, FilmScore>();

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

export function sortFilmsByScore<T extends { id: string; year?: number | null }>(
  films: T[],
  filmScoresById: Map<string, FilmScore>
) {
  return [...films].sort((a, b) => {
    const scoreDifference =
      (filmScoresById.get(b.id)?.balanced ?? 0) -
      (filmScoresById.get(a.id)?.balanced ?? 0);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (b.year ?? 0) - (a.year ?? 0);
  });
}
