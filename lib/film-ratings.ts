type FilmRatingRow = {
  film_id?: string | null;
  rating?: number | string | null;
};

export function buildFilmRatings(
  ratings: FilmRatingRow[] | null | undefined
): Record<string, number> {
  const filmRatings: Record<string, number> = {};

  for (const item of ratings ?? []) {
    if (!item?.film_id) {
      continue;
    }

    const value = Number(item.rating);
    if (!Number.isFinite(value)) {
      continue;
    }

    filmRatings[item.film_id] = value;
  }

  return filmRatings;
}

export function getFilmRating(
  filmRatings: Record<string, number> | null | undefined,
  filmId: string
): number | null {
  const value = filmRatings?.[filmId];
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}
