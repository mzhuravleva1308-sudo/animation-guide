const LEADING_ARTICLE_PATTERN =
  /^(the|a|an|le|la|les|l|el|los|las|un|une|des|der|die|das)\s+/;

const URL_FIELDS = ["source_url", "watch_url", "trailer_url"];
const EXTERNAL_ID_FIELDS = ["tmdb_id", "imdb_id"];

/** @typedef {import("./film-duplicate-check.types").FilmIdentity} FilmIdentity */
/** @typedef {import("./film-duplicate-check.types").DuplicateMatch} DuplicateMatch */

/**
 * @param {string | null | undefined} value
 * @param {{ stripArticles?: boolean }} [options]
 */
export function normalizeFilmString(value, { stripArticles = true } = {}) {
  if (!value) return "";

  let normalized = value
    .toLowerCase()
    .trim()
    .replace(/[''""]/g, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/[^a-z0-9\s\u00c0-\u024f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripArticles) {
    while (LEADING_ARTICLE_PATTERN.test(normalized)) {
      normalized = normalized.replace(LEADING_ARTICLE_PATTERN, "").trim();
    }
  }

  return normalized;
}

/** @param {string | null | undefined} value */
export function normalizeDirector(value) {
  return normalizeFilmString(value, { stripArticles: false });
}

/** @param {string | null | undefined} value */
function normalizeUrl(value) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function getTitleSimilarity(a, b) {
  const normalizedA = normalizeFilmString(a);
  const normalizedB = normalizeFilmString(b);

  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 100;

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    const shorter = Math.min(normalizedA.length, normalizedB.length);
    const longer = Math.max(normalizedA.length, normalizedB.length);
    return 70 + (shorter / longer) * 15;
  }

  const wordsA = normalizedA.split(" ").filter(Boolean);
  const wordsB = new Set(normalizedB.split(" ").filter(Boolean));
  const sharedWords = wordsA.filter((word) => wordsB.has(word));

  return (sharedWords.length / Math.max(wordsA.length, wordsB.size)) * 85;
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function getDirectorSimilarity(a, b) {
  const normalizedA = normalizeDirector(a);
  const normalizedB = normalizeDirector(b);

  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 100;

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 80;
  }

  const wordsA = normalizedA.split(" ").filter(Boolean);
  const wordsB = new Set(normalizedB.split(" ").filter(Boolean));
  const sharedWords = wordsA.filter((word) => wordsB.has(word));

  return (sharedWords.length / Math.max(wordsA.length, wordsB.size)) * 75;
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function getWordOverlapRatio(a, b) {
  const normalizedA = normalizeFilmString(a);
  const normalizedB = normalizeFilmString(b);

  if (!normalizedA || !normalizedB) return 0;

  const wordsA = normalizedA.split(" ").filter(Boolean);
  const wordsB = new Set(normalizedB.split(" ").filter(Boolean));
  const sharedWords = wordsA.filter((word) => wordsB.has(word));

  return sharedWords.length / Math.max(wordsA.length, wordsB.size);
}

/**
 * @param {number | null | undefined} a
 * @param {number | null | undefined} b
 * @returns {"same" | "close" | "far" | "unknown"}
 */
export function compareYears(a, b) {
  if (a == null || b == null) return "unknown";

  if (a === b) return "same";
  if (Math.abs(a - b) <= 1) return "close";
  return "far";
}

/**
 * @param {FilmIdentity} incoming
 * @param {FilmIdentity} existing
 * @returns {string | null}
 */
export function getMatchingExternalIdField(incoming, existing) {
  for (const field of EXTERNAL_ID_FIELDS) {
    const incomingValue = incoming[field];
    const existingValue = existing[field];

    if (
      incomingValue != null &&
      existingValue != null &&
      incomingValue === existingValue
    ) {
      return field;
    }
  }

  for (const field of URL_FIELDS) {
    const incomingUrl = normalizeUrl(incoming[field]);
    const existingUrl = normalizeUrl(existing[field]);

    if (incomingUrl && existingUrl && incomingUrl === existingUrl) {
      return field;
    }
  }

  return null;
}

/**
 * @param {FilmIdentity} incoming
 * @param {FilmIdentity} existing
 * @returns {DuplicateMatch | null}
 */
export function evaluateDuplicate(incoming, existing) {
  if (incoming.id && existing.id && incoming.id === existing.id) {
    return null;
  }

  const externalMatch = getMatchingExternalIdField(incoming, existing);
  if (externalMatch) {
    return {
      existingFilm: existing,
      score: 100,
      isHardDuplicate: true,
      reasons: [`matching ${externalMatch}`],
    };
  }

  const titleSimilarity = Math.max(
    getTitleSimilarity(incoming.title, existing.title),
    getTitleSimilarity(incoming.title, existing.original_title),
    getTitleSimilarity(incoming.original_title, existing.title),
    getTitleSimilarity(incoming.original_title, existing.original_title)
  );

  const originalTitleSimilarity = Math.max(
    getTitleSimilarity(incoming.original_title, existing.original_title),
    getTitleSimilarity(incoming.original_title, existing.title),
    getTitleSimilarity(incoming.title, existing.original_title)
  );

  const directorSimilarity = getDirectorSimilarity(
    incoming.director,
    existing.director
  );
  const yearRelation = compareYears(incoming.year, existing.year);

  const normalizedIncomingTitle = normalizeFilmString(incoming.title);
  const normalizedExistingTitle = normalizeFilmString(existing.title);
  const exactTitleMatch =
    normalizedIncomingTitle.length > 0 &&
    normalizedIncomingTitle === normalizedExistingTitle;

  if (exactTitleMatch && yearRelation === "same") {
    return {
      existingFilm: existing,
      score: 100,
      isHardDuplicate: true,
      reasons: ["exact normalized title match", "same year"],
    };
  }

  if (yearRelation === "far" && directorSimilarity < 60 && titleSimilarity < 95) {
    return null;
  }

  const reasons = [];
  let score = 0;

  if (
    titleSimilarity >= 80 &&
    (yearRelation === "same" || yearRelation === "close")
  ) {
    score = Math.max(score, titleSimilarity);
    reasons.push(`similar title (${Math.round(titleSimilarity)}% match)`);
    reasons.push(
      yearRelation === "same" ? "same year" : "year within 1"
    );
  }

  if (originalTitleSimilarity >= 80 && directorSimilarity >= 75) {
    const combinedScore = (originalTitleSimilarity + directorSimilarity) / 2;
    if (combinedScore > score) {
      score = combinedScore;
      reasons.length = 0;
      reasons.push(
        `similar original title (${Math.round(originalTitleSimilarity)}% match)`
      );
      reasons.push(
        `similar director (${Math.round(directorSimilarity)}% match)`
      );
    }
  }

  const wordOverlap = getWordOverlapRatio(incoming.title, existing.title);
  if (wordOverlap >= 0.5 && yearRelation === "same" && directorSimilarity >= 70) {
    const partialScore = 60 + wordOverlap * 30 + directorSimilarity * 0.1;
    if (partialScore > score) {
      score = partialScore;
      reasons.length = 0;
      reasons.push(
        `partial title word overlap (${Math.round(wordOverlap * 100)}%)`
      );
      reasons.push("same year");
      reasons.push(`similar director (${Math.round(directorSimilarity)}% match)`);
    }
  }

  if (score < 70) {
    return null;
  }

  return {
    existingFilm: existing,
    score,
    isHardDuplicate: false,
    reasons,
  };
}

/**
 * @param {FilmIdentity} incoming
 * @param {FilmIdentity[]} existingFilms
 * @returns {DuplicateMatch[]}
 */
export function findFilmDuplicates(incoming, existingFilms) {
  const matches = [];

  for (const existing of existingFilms) {
    const match = evaluateDuplicate(incoming, existing);
    if (match) {
      matches.push(match);
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * @param {Record<string, unknown>} film
 */
export function applyNormalizedFields(film) {
  return {
    ...film,
    normalized_title: normalizeFilmString(String(film.title ?? "")) || null,
    normalized_original_title: film.original_title
      ? normalizeFilmString(String(film.original_title)) || null
      : null,
  };
}

/**
 * @param {DuplicateMatch[]} matches
 * @param {{ allowPossibleDuplicates?: boolean, forceExactDuplicate?: boolean }} [options]
 */
export function shouldBlockInsert(matches, options = {}) {
  const {
    allowPossibleDuplicates = false,
    forceExactDuplicate = false,
  } = options;

  if (!matches.length) {
    return { blocked: false, reason: null, matches: [] };
  }

  const hardMatches = matches.filter((match) => match.isHardDuplicate);
  const softMatches = matches.filter((match) => !match.isHardDuplicate);

  if (hardMatches.length && !forceExactDuplicate) {
    return {
      blocked: true,
      reason: "hard_duplicate",
      matches: hardMatches,
    };
  }

  if (softMatches.length && !allowPossibleDuplicates && !forceExactDuplicate) {
    return {
      blocked: true,
      reason: "possible_duplicate",
      matches: softMatches,
    };
  }

  return { blocked: false, reason: null, matches };
}

/**
 * @param {string[]} argv
 */
export function parseInsertFilmFlags(argv) {
  return {
    allowPossibleDuplicates: argv.includes("--allow-possible-duplicates"),
    forceExactDuplicate: argv.includes("--force-exact-duplicate"),
  };
}
