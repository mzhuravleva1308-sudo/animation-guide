export type FilmRatingDetail = {
  visual: number;
  mood: number;
  plot: number;
};

export function isValidAxisRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
  );
}

export function isValidFilmRatingDetail(
  value: unknown
): value is FilmRatingDetail {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    isValidAxisRating(row.visual) &&
    isValidAxisRating(row.mood) &&
    isValidAxisRating(row.plot)
  );
}

export function defaultRatingDetailFromOverall(
  overall: number
): FilmRatingDetail {
  return {
    visual: overall,
    mood: overall,
    plot: overall,
  };
}
