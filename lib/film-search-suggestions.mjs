import {
  getFuzzyTextSimilarity,
  isSearchQueryUsable,
  normalizeSearchQuery,
} from "./film-search.mjs";

const DEFAULT_SUGGESTION_LIMIT = 8;
const MAX_SUGGESTION_LIMIT = 8;

const TEXT_SUGGESTION_FIELDS = [
  { type: "title", weight: 12, getValue: (film) => film.title },
  {
    type: "original title",
    weight: 10,
    getValue: (film) => film.original_title,
  },
  { type: "director", weight: 7, getValue: (film) => film.director },
  { type: "country", weight: 5, getValue: (film) => film.country },
  { type: "technique", weight: 5, getValue: (film) => film.technique },
];

const TAG_SUGGESTION_FIELDS = [
  { type: "mood", weight: 6, field: "moods" },
  { type: "aesthetic", weight: 6, field: "aesthetic_tags" },
  { type: "narrative", weight: 6, field: "narrative_tags" },
];

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

/**
 * @param {Map<string, { label: string, type: string, score: number }>} candidates
 * @param {string} query
 * @param {string | null | undefined} value
 * @param {string} type
 * @param {number} weight
 */
function addTextSuggestion(candidates, query, value, type, weight) {
  if (!value) {
    return;
  }

  const label = String(value).trim();
  if (!label) {
    return;
  }

  const similarity = getFuzzyTextSimilarity(query, label);
  if (similarity < 45) {
    return;
  }

  const score = (similarity / 100) * weight;
  const key = `${type}:${normalizeSearchQuery(label)}`;
  const existing = candidates.get(key);

  if (!existing || score > existing.score) {
    candidates.set(key, { label, type, score });
  }
}

/**
 * @param {Record<string, unknown>[]} films
 * @param {string} query
 * @param {{ limit?: number }} [options]
 */
export function getSearchSuggestions(films, query, options = {}) {
  if (!isSearchQueryUsable(query)) {
    return [];
  }

  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_SUGGESTION_LIMIT, 1),
    MAX_SUGGESTION_LIMIT
  );
  const candidates = new Map();

  for (const film of films) {
    for (const field of TEXT_SUGGESTION_FIELDS) {
      addTextSuggestion(
        candidates,
        query,
        field.getValue(film),
        field.type,
        field.weight
      );
    }

    for (const field of TAG_SUGGESTION_FIELDS) {
      const tags = normalizeFilmTagList(film[field.field]);
      for (const tag of tags) {
        addTextSuggestion(candidates, query, tag, field.type, field.weight);
      }
    }

    if (film.year != null) {
      addTextSuggestion(
        candidates,
        query,
        String(film.year),
        "year",
        8
      );
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.label.localeCompare(b.label);
    })
    .slice(0, limit)
    .map((suggestion) => ({
      label: suggestion.label,
      type: suggestion.type,
      score: Number(suggestion.score.toFixed(2)),
    }));
}

export const filmSearchSuggestionConstants = {
  DEFAULT_SUGGESTION_LIMIT,
  MAX_SUGGESTION_LIMIT,
};
