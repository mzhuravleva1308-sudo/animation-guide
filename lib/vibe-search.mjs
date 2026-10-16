/**
 * Test-only vibe search: “about kindness and magic”, not title lookup.
 * Does not replace lib/film-search.mjs.
 */

import { cosineSimilarity } from "./per-like-catalog-ranking.mjs";

const MIN_QUERY_LENGTH = 2;

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "with",
  "about",
  "like",
  "something",
  "movie",
  "movies",
  "film",
  "films",
  "cartoon",
  "cartoons",
  "animated",
  "animation",
  "i",
  "и",
  "в",
  "на",
  "про",
  "мультик",
  "мультики",
  "мультфильм",
  "мультфильмы",
  "фильм",
  "кино",
  "что-то",
  "чтото",
  "ощущение",
  "ощущения",
  "чувство",
  "feeling",
  "sense",
  "мир",
  "мире",
  "world",
]);

/** Stem-ish expansions: query token → catalog English terms. */
const TOKEN_EXPANSIONS = {
  добро: [
    "kindness",
    "kind",
    "warmth",
    "warm",
    "tender",
    "gentle",
    "generous",
    "heartfelt",
    "compassion",
    "compassionate",
    "goodness",
    "wholesome",
    "tenderhearted",
    "caring",
  ],
  добрый: [
    "kindness",
    "kind",
    "warm",
    "tender",
    "gentle",
    "heartfelt",
    "wholesome",
  ],
  добра: [
    "kindness",
    "kind",
    "warmth",
    "warm",
    "tender",
    "gentle",
    "heartfelt",
  ],
  волшебство: [
    "magic",
    "magical",
    "wonder",
    "wondrous",
    "enchantment",
    "enchanted",
    "fairy",
    "spell",
    "fantastical",
    "whimsical",
  ],
  волшебный: [
    "magic",
    "magical",
    "wonder",
    "enchanted",
    "fairy",
    "whimsical",
  ],
  волшебства: [
    "magic",
    "magical",
    "wonder",
    "enchantment",
    "quiet wonder",
    "everyday magic",
  ],
  забота: [
    "care",
    "caring",
    "tenderness",
    "nurture",
    "companionship",
    "gentle",
    "tender",
  ],
  заботы: [
    "care",
    "caring",
    "tenderness",
    "nurture",
    "companionship",
    "gentle",
    "tender",
  ],
  сложный: [
    "difficult",
    "hardship",
    "harsh",
    "bittersweet",
    "loss",
    "grief",
    "complex",
  ],
  сложном: [
    "difficult",
    "hardship",
    "harsh",
    "bittersweet",
    "loss",
    "grief",
    "complex",
  ],
  обыденности: [
    "everyday",
    "ordinary",
    "mundane",
    "daily",
    "domestic",
    "quiet",
    "small",
  ],
  обыденность: [
    "everyday",
    "ordinary",
    "mundane",
    "daily",
    "domestic",
    "quiet",
  ],
  дора: [
    "kindness",
    "kind",
    "warmth",
    "warm",
    "tender",
    "gentle",
    "heartfelt",
  ],
  kindness: ["kindness", "kind", "warmth", "warm", "tender", "gentle"],
  magic: ["magic", "magical", "wonder", "enchantment", "enchanted", "fairy"],
  magical: ["magic", "magical", "wonder", "enchantment", "enchanted"],
  wonder: ["wonder", "wondrous", "awe", "enchantment"],
};

const STEM_ALIASES = [
  ["забот", "забота"],
  ["сложн", "сложный"],
  ["обыден", "обыденность"],
  ["волшеб", "волшебство"],
  ["добр", "добро"],
];

const KIND_FACET = new Set([
  "добро",
  "добрый",
  "добра",
  "дора",
  "забота",
  "заботы",
  "kindness",
  "kind",
  "warmth",
  "warm",
  "tender",
  "tenderness",
  "gentle",
  "generous",
  "heartfelt",
  "compassion",
  "compassionate",
  "goodness",
  "wholesome",
  "tenderhearted",
  "caring",
  "care",
  "nurture",
  "companionship",
]);

const MAGIC_FACET = new Set([
  "волшебство",
  "волшебный",
  "волшебства",
  "обыденности",
  "обыденность",
  "magic",
  "magical",
  "wonder",
  "wondrous",
  "enchantment",
  "enchanted",
  "fairy",
  "spell",
  "fantastical",
  "everyday",
  "ordinary",
  "mundane",
  "daily",
  "domestic",
  "quiet",
  "small",
]);

const HARD_WORLD_FACET = new Set([
  "сложный",
  "сложном",
  "difficult",
  "hardship",
  "harsh",
  "bittersweet",
  "loss",
  "grief",
  "complex",
  "lonely",
  "loneliness",
  "cold",
  "struggle",
  "poverty",
  "tension",
]);

const LOOKUP_HINT =
  /\b(19|20)\d{2}\b|\b(miyazaki|ghibli|pixar|satrapi|koreeda)\b/i;
const VIBE_HINT =
  /\b(про|about|like|похож|добр|забот|волшеб|обыден|сложн|грустн|тёмн|темн|kind|care|magic|warm|sad|ordinary|everyday)\b/i;

/**
 * @param {string} query
 */
export function normalizeVibeQuery(query) {
  return String(query ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} query
 */
export function detectSearchIntent(query) {
  const normalized = normalizeVibeQuery(query);
  if (normalized.length < MIN_QUERY_LENGTH) {
    return "empty";
  }

  const tokens = normalized.split(" ").filter(Boolean);
  if (VIBE_HINT.test(normalized) || tokens.length >= 4) {
    return "vibe";
  }

  if (LOOKUP_HINT.test(normalized) || tokens.length <= 3) {
    return "lookup";
  }

  return "vibe";
}

/**
 * @param {string} query
 */
function resolveExpansionKey(token) {
  if (TOKEN_EXPANSIONS[token]) return token;
  for (const [stem, key] of STEM_ALIASES) {
    if (token.startsWith(stem)) return key;
  }
  return token;
}

export function expandVibeTerms(query) {
  const normalized = normalizeVibeQuery(query);
  const tokens = normalized.split(" ").filter((token) => !STOPWORDS.has(token));
  /** @type {Set<string>} */
  const terms = new Set();

  for (const token of tokens) {
    terms.add(token);
    const key = resolveExpansionKey(token);
    for (const extra of TOKEN_EXPANSIONS[key] ?? []) {
      terms.add(extra);
    }
  }

  return [...terms];
}

/**
 * Mood-embedding input in the same family as fill-film-mood-embeddings.mjs.
 * @param {string[]} terms
 */
export function buildMoodQueryText(terms) {
  const moodLike = terms.filter((term) =>
    /^(tender|tenderness|warm|gentle|kind|caring|care|heartfelt|wonder|whimsical|compassionate|goodness|wholesome|bittersweet|lonely|grief|quiet|nurturing)$/i.test(
      term
    )
  );
  const unique = [...new Set(moodLike.length ? moodLike : terms)].slice(0, 10);
  return `animated film emotional atmosphere: ${unique.join(", ")}`;
}

/**
 * @param {string[]} terms
 */
export function buildAestheticQueryText(terms) {
  const lookLike = terms.filter((term) =>
    /^(magic|magical|enchanted|enchantment|wonder|wondrous|fairy|whimsical|fantastical|everyday|ordinary|domestic|quiet|sensorial|small)$/i.test(
      term
    )
  );
  const unique = [...new Set(lookLike.length ? lookLike : terms)].slice(0, 10);
  return `animated film aesthetic and material feeling: ${unique.join(", ")}`;
}

/**
 * @param {unknown} value
 */
function asTextList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => asTextList(item)).filter(Boolean);
  }
  return String(value)
    .split(/[,;|/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {Record<string, unknown>} film
 */
export function filmVibeHaystack(film) {
  const parts = [
    film.the_mood,
    film.what_it_is,
    film.synopsis,
    ...asTextList(film.themes),
    ...asTextList(film.moods),
    ...asTextList(film.narrative_tags),
    ...asTextList(film.aesthetic_tags),
  ];

  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/ё/g, "е");
}

/**
 * @param {string[]} terms
 * @param {Record<string, unknown>} film
 */
export function scoreLexicalVibe(terms, film) {
  if (!terms.length) {
    return { score: 0, matchedTerms: [] };
  }

  const haystack = filmVibeHaystack(film);
  if (!haystack) {
    return { score: 0, matchedTerms: [] };
  }

  const matchedTerms = terms.filter((term) => {
    if (term.length < 3) return false;
    return haystack.includes(term.toLowerCase());
  });

  const uniqueMatched = [...new Set(matchedTerms)];
  const contentTerms = terms.filter((term) => term.length >= 3);
  const coverage = contentTerms.length
    ? uniqueMatched.length / contentTerms.length
    : 0;

  const queryHasKind = terms.some((term) => KIND_FACET.has(term));
  const queryHasMagic = terms.some((term) => MAGIC_FACET.has(term));
  const queryHasHardWorld = terms.some((term) => HARD_WORLD_FACET.has(term));
  const matchedKind = uniqueMatched.some((term) => KIND_FACET.has(term));
  const matchedMagic = uniqueMatched.some((term) => MAGIC_FACET.has(term));
  const matchedHardWorld = uniqueMatched.some((term) =>
    HARD_WORLD_FACET.has(term)
  );

  let facetGate = 1;
  if (queryHasKind && queryHasMagic) {
    if (matchedKind && matchedMagic) facetGate = 1;
    else if (matchedKind || matchedMagic) facetGate = 0.45;
    else facetGate = 0.2;
  }

  // “care in a hard world”: reward contrast when both care and hardness appear.
  if (queryHasHardWorld) {
    if (matchedKind && matchedHardWorld) facetGate *= 1.25;
    else if (matchedKind && !matchedHardWorld) facetGate *= 0.85;
    else if (!matchedKind && matchedHardWorld) facetGate *= 0.7;
  }

  const hostile =
    /\b(brutal|gore|massacre|revenge|explosive violence|darkly comedic)\b/i.test(
      haystack
    );

  return {
    score: Math.max(0, coverage * facetGate - (hostile ? 0.15 : 0)),
    matchedTerms: uniqueMatched,
    matchedKind,
    matchedMagic,
    matchedHardWorld,
  };
}

/**
 * @param {string | null | undefined} kidSafety
 * @param {{ wantsCartoon?: boolean }} [options]
 */
export function kidSafetyBias(kidSafety, options = {}) {
  if (!options.wantsCartoon) return 0;
  const value = String(kidSafety ?? "").toLowerCase();
  if (value === "yes") return 0.08;
  if (value === "maybe") return 0.03;
  if (value === "no") return -0.05;
  return 0;
}

/**
 * @param {number} similarity
 */
export function squashCosine(similarity) {
  if (!Number.isFinite(similarity)) return 0;
  return Math.max(0, (similarity - 0.15) / 0.85);
}

/**
 * @param {{
 *   moodSimilarity?: number,
 *   aestheticSimilarity?: number,
 *   lexicalScore: number,
 *   kidSafety?: string | null,
 *   wantsCartoon?: boolean,
 * }} input
 */
export function combineVibeScore(input) {
  const mood = squashCosine(input.moodSimilarity ?? 0);
  const aesthetic = squashCosine(input.aestheticSimilarity ?? 0);
  const lexical = Math.max(0, Math.min(1, input.lexicalScore ?? 0));
  const hasMood = Number.isFinite(input.moodSimilarity);
  const hasAesthetic = Number.isFinite(input.aestheticSimilarity);

  let moodWeight = hasMood ? 0.45 : 0;
  let aestheticWeight = hasAesthetic ? 0.2 : 0;
  let lexicalWeight = 0.35;
  const used = moodWeight + aestheticWeight + lexicalWeight;
  moodWeight /= used;
  aestheticWeight /= used;
  lexicalWeight /= used;

  const base =
    mood * moodWeight + aesthetic * aestheticWeight + lexical * lexicalWeight;

  return Math.max(
    0,
    base + kidSafetyBias(input.kidSafety, { wantsCartoon: input.wantsCartoon })
  );
}

/**
 * @param {Record<string, unknown>[]} films
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   moodEmbeddingByFilmId?: Map<string, number[]>,
 *   aestheticEmbeddingByFilmId?: Map<string, number[]>,
 *   queryMoodEmbedding?: number[] | null,
 *   queryAestheticEmbedding?: number[] | null,
 * }} [options]
 */
export function searchVibeFilms(films, query, options = {}) {
  const intent = detectSearchIntent(query);
  const terms = expandVibeTerms(query);
  const wantsCartoon = /\b(мультик|мультфильм|cartoon)\b/i.test(query);
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 200);

  const scored = films.map((film) => {
    const lexical = scoreLexicalVibe(terms, film);
    const moodEmbedding = options.moodEmbeddingByFilmId?.get(String(film.id));
    const aestheticEmbedding = options.aestheticEmbeddingByFilmId?.get(
      String(film.id)
    );
    const moodSimilarity =
      options.queryMoodEmbedding && moodEmbedding
        ? cosineSimilarity(options.queryMoodEmbedding, moodEmbedding)
        : undefined;
    const aestheticSimilarity =
      options.queryAestheticEmbedding && aestheticEmbedding
        ? cosineSimilarity(options.queryAestheticEmbedding, aestheticEmbedding)
        : undefined;

    let score = combineVibeScore({
      moodSimilarity,
      aestheticSimilarity,
      lexicalScore: lexical.score,
      kidSafety: film.kid_safety,
      wantsCartoon,
    });

    const queryHasBothFacets =
      terms.some((term) => KIND_FACET.has(term)) &&
      terms.some((term) => MAGIC_FACET.has(term));
    if (queryHasBothFacets && lexical.matchedKind && !lexical.matchedMagic) {
      score *= 0.72;
    } else if (
      queryHasBothFacets &&
      !lexical.matchedKind &&
      lexical.matchedMagic
    ) {
      score *= 0.8;
    } else if (
      queryHasBothFacets &&
      !lexical.matchedKind &&
      !lexical.matchedMagic
    ) {
      score *= 0.55;
    }

    return {
      film,
      score,
      intent,
      matchedTerms: lexical.matchedTerms,
      moodSimilarity: moodSimilarity ?? null,
      aestheticSimilarity: aestheticSimilarity ?? null,
      lexicalScore: lexical.score,
    };
  });

  return scored
    .filter((row) => row.score > 0.04)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.film.title ?? "").localeCompare(String(b.film.title ?? ""));
    })
    .slice(0, limit);
}

/**
 * Build the embedding input in the same shape as fill-film-mood-embeddings.mjs.
 * @param {string} englishMoodPhrase
 */
export function buildMoodEmbeddingInput(englishMoodPhrase) {
  const phrase = String(englishMoodPhrase ?? "")
    .trim()
    .replace(/^animated film emotional atmosphere:\s*/i, "");
  return `animated film emotional atmosphere: ${phrase}`;
}

/**
 * Prompt: free-form query (any language) → short English mood phrase
 * aligned with catalog mood-tag embeddings.
 * @param {string} query
 */
export function buildVibeQueryNormalizePrompt(query) {
  return [
    "Rewrite the user's animated-film feeling query as a short English emotional atmosphere phrase.",
    "Match the style of mood tags: tender, warm, bittersweet, quiet wonder, harsh world, everyday magic.",
    "Keep contrast if present (care in a hard world, magic in the ordinary).",
    "Do not name films, directors, or plots. No quotes. English only. Max 18 words.",
    "",
    `Query: ${String(query ?? "").trim()}`,
  ].join("\n");
}

/**
 * @param {string | null | undefined} raw
 * @param {string} fallbackQuery
 */
export function cleanNormalizedVibePhrase(raw, fallbackQuery) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^animated film emotional atmosphere:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length >= 3) return cleaned;
  return String(fallbackQuery ?? "").trim();
}

/**
 * Simplest production ranker: query embedding × film mood embeddings,
 * then blend with personal balanced taste. Rated films are excluded.
 *
 * @param {{
 *   films: Record<string, unknown>[],
 *   queryEmbedding: number[],
 *   moodEmbeddingByFilmId: Map<string, number[]>,
 *   personalByFilmId?: Map<string, { balanced?: number } | number>,
 *   ratedFilmIds?: Set<string> | string[],
 *   limit?: number,
 *   vibeWeight?: number,
 *   tasteWeight?: number,
 * }} input
 */
export function rankVibeByMoodEmbedding(input) {
  const {
    films,
    queryEmbedding,
    moodEmbeddingByFilmId,
    personalByFilmId = new Map(),
    ratedFilmIds = [],
    limit = 12,
    vibeWeight = 0.55,
    tasteWeight = 0.45,
  } = input;

  const rated = new Set(
    ratedFilmIds instanceof Set ? ratedFilmIds : ratedFilmIds
  );
  const cappedLimit = Math.min(Math.max(limit, 1), 50);

  /** @type {Array<{
   *   film: Record<string, unknown>,
   *   score: number,
   *   moodSimilarity: number,
   *   personalScore: number,
   *   combinedScore: number,
   *   matchedTerms: string[],
   *   lexicalScore: number,
   *   aestheticSimilarity: null,
   * }>} */
  const rows = [];

  for (const film of films ?? []) {
    if (!film?.id || rated.has(film.id)) continue;
    const moodEmbedding = moodEmbeddingByFilmId.get(String(film.id));
    if (!moodEmbedding) continue;

    const moodSimilarity = cosineSimilarity(queryEmbedding, moodEmbedding);
    const vibeScore = squashCosine(moodSimilarity);
    const stored = personalByFilmId.get(film.id);
    const personalScore =
      typeof stored === "number" ? stored : Number(stored?.balanced ?? 0);
    const combinedScore = vibeWeight * vibeScore + tasteWeight * personalScore;

    rows.push({
      film,
      score: vibeScore,
      moodSimilarity,
      personalScore,
      combinedScore,
      matchedTerms: [],
      lexicalScore: 0,
      aestheticSimilarity: null,
    });
  }

  return rows
    .filter((row) => row.combinedScore > 0.04)
    .sort((a, b) => {
      if (b.combinedScore !== a.combinedScore) {
        return b.combinedScore - a.combinedScore;
      }
      return String(a.film.title ?? "").localeCompare(String(b.film.title ?? ""));
    })
    .slice(0, cappedLimit);
}

/**
 * Mix vibe relevance with catalog personal ranking (balanced 0–1).
 * Rated films are dropped — this is “what to watch next”, not a re-list of likes.
 *
 * @param {Array<{ film: { id?: string, title?: string }, score: number }>} vibeRows
 * @param {Map<string, { balanced?: number } | number>} personalByFilmId
 * @param {{
 *   limit?: number,
 *   vibeWeight?: number,
 *   tasteWeight?: number,
 *   ratedFilmIds?: Set<string> | string[],
 * }} [options]
 */
export function rankPersonalizedVibe(vibeRows, personalByFilmId, options = {}) {
  const vibeWeight = options.vibeWeight ?? 0.55;
  const tasteWeight = options.tasteWeight ?? 0.45;
  const rated = new Set(
    options.ratedFilmIds instanceof Set
      ? options.ratedFilmIds
      : options.ratedFilmIds ?? []
  );
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);

  return (vibeRows ?? [])
    .filter((row) => row?.film?.id && !rated.has(row.film.id))
    .map((row) => {
      const stored = personalByFilmId?.get(row.film.id);
      const personalScore =
        typeof stored === "number" ? stored : Number(stored?.balanced ?? 0);
      const combinedScore =
        vibeWeight * Number(row.score ?? 0) + tasteWeight * personalScore;

      return {
        ...row,
        personalScore,
        combinedScore,
      };
    })
    .sort((a, b) => {
      if (b.combinedScore !== a.combinedScore) {
        return b.combinedScore - a.combinedScore;
      }
      return String(a.film.title ?? "").localeCompare(String(b.film.title ?? ""));
    })
    .slice(0, limit);
}

export const vibeSearchConstants = {
  MIN_QUERY_LENGTH,
};
