import {
  getTitleSimilarity,
  normalizeFilmString,
} from "./film-duplicate-check.mjs";

/**
 * @param {string[] | string | null | undefined} value
 */
function normalizeFilmTagList(value) {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeFilmTagList(item)).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }

  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

const FIELD_WEIGHTS = {
  title: 12,
  original_title: 10,
  director: 7,
  year: 8,
  country: 5,
  technique: 5,
  mood: 6,
  aesthetic: 6,
  narrative: 6,
  synopsis: 3,
};

/**
 * @param {string} a
 * @param {string} b
 */
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function getFuzzyTextSimilarity(a, b) {
  const normalizedA = normalizeFilmString(a);
  const normalizedB = normalizeFilmString(b);

  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 100;

  if (
    normalizedA.includes(normalizedB) ||
    normalizedB.includes(normalizedA)
  ) {
    const shorter = Math.min(normalizedA.length, normalizedB.length);
    const longer = Math.max(normalizedA.length, normalizedB.length);
    return 75 + (shorter / longer) * 20;
  }

  const titleSimilarity = getTitleSimilarity(normalizedA, normalizedB);
  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  const distance = levenshteinDistance(normalizedA, normalizedB);
  const levenshteinRatio = Math.max(
    0,
    1 - distance / Math.max(maxLength, 1)
  );

  return Math.max(titleSimilarity, levenshteinRatio * 100);
}

/**
 * @param {string | null | undefined} query
 */
export function normalizeSearchQuery(query) {
  return normalizeFilmString(String(query ?? "").trim());
}

/**
 * @param {string | null | undefined} query
 */
export function isSearchQueryUsable(query) {
  return normalizeSearchQuery(query).length >= MIN_QUERY_LENGTH;
}

/**
 * @param {string} query
 * @param {string | null | undefined} value
 * @param {number} weight
 */
function scoreTextField(query, value, weight) {
  if (!value) return 0;

  const similarity = getFuzzyTextSimilarity(query, value);
  if (similarity < 45) return 0;

  return (similarity / 100) * weight;
}

/**
 * @param {string} query
 * @param {string[] | null | undefined} tags
 * @param {number} weight
 */
function scoreTagField(query, tags, weight) {
  const normalizedTags = normalizeFilmTagList(tags);
  if (!normalizedTags.length) return 0;

  let best = 0;

  for (const tag of normalizedTags) {
    const similarity = getFuzzyTextSimilarity(query, tag);
    if (similarity >= 45) {
      best = Math.max(best, (similarity / 100) * weight);
    }
  }

  return best;
}

/**
 * @param {string} query
 * @param {Record<string, unknown>} film
 */
export function scoreFilmSearchMatch(query, film) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < MIN_QUERY_LENGTH) {
    return { score: 0, matchedFields: [] };
  }

  const matchedFields = [];
  let score = 0;

  const titleScore = scoreTextField(
    normalizedQuery,
    film.title,
    FIELD_WEIGHTS.title
  );
  if (titleScore > 0) {
    score += titleScore;
    matchedFields.push("title");
  }

  const originalTitleScore = scoreTextField(
    normalizedQuery,
    film.original_title,
    FIELD_WEIGHTS.original_title
  );
  if (originalTitleScore > 0) {
    score += originalTitleScore;
    matchedFields.push("original_title");
  }

  const directorScore = scoreTextField(
    normalizedQuery,
    film.director,
    FIELD_WEIGHTS.director
  );
  if (directorScore > 0) {
    score += directorScore;
    matchedFields.push("director");
  }

  const countryScore = scoreTextField(
    normalizedQuery,
    film.country,
    FIELD_WEIGHTS.country
  );
  if (countryScore > 0) {
    score += countryScore;
    matchedFields.push("country");
  }

  const techniqueScore = scoreTextField(
    normalizedQuery,
    film.technique,
    FIELD_WEIGHTS.technique
  );
  if (techniqueScore > 0) {
    score += techniqueScore;
    matchedFields.push("technique");
  }

  const synopsisScore = scoreTextField(
    normalizedQuery,
    film.synopsis,
    FIELD_WEIGHTS.synopsis
  );
  if (synopsisScore > 0) {
    score += synopsisScore;
    matchedFields.push("synopsis");
  }

  const moodScore = scoreTagField(
    normalizedQuery,
    film.moods,
    FIELD_WEIGHTS.mood
  );
  if (moodScore > 0) {
    score += moodScore;
    matchedFields.push("moods");
  }

  const aestheticScore = scoreTagField(
    normalizedQuery,
    film.aesthetic_tags,
    FIELD_WEIGHTS.aesthetic
  );
  if (aestheticScore > 0) {
    score += aestheticScore;
    matchedFields.push("aesthetic_tags");
  }

  const narrativeScore = scoreTagField(
    normalizedQuery,
    film.narrative_tags,
    FIELD_WEIGHTS.narrative
  );
  if (narrativeScore > 0) {
    score += narrativeScore;
    matchedFields.push("narrative_tags");
  }

  const yearQuery = normalizedQuery.match(/\b(19|20)\d{2}\b/)?.[0];
  if (yearQuery && film.year != null && String(film.year) === yearQuery) {
    score += FIELD_WEIGHTS.year;
    matchedFields.push("year");
  } else if (/^\d{4}$/.test(normalizedQuery) && film.year != null) {
    const yearSimilarity = getFuzzyTextSimilarity(
      normalizedQuery,
      String(film.year)
    );
    if (yearSimilarity >= 90) {
      score += (yearSimilarity / 100) * FIELD_WEIGHTS.year;
      matchedFields.push("year");
    }
  }

  return {
    score,
    matchedFields: [...new Set(matchedFields)],
  };
}

/**
 * @param {Record<string, unknown>[]} films
 * @param {string} query
 * @param {{ limit?: number }} [options]
 */
export function searchFilms(films, query, options = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  return films
    .map((film) => {
      const { score, matchedFields } = scoreFilmSearchMatch(query, film);

      return {
        film,
        score,
        matchedFields,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return String(a.film.title ?? "").localeCompare(String(b.film.title ?? ""));
    })
    .slice(0, limit);
}

export const filmSearchConstants = {
  MIN_QUERY_LENGTH,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
