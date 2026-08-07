/**
 * Prepare a cleaned the_mood corpus from Resonale films rows.
 * Deterministic filters only — no LLM, no DB writes.
 */

import {
  BANNED_MOOD_PHRASES,
  BANNED_PHRASES,
  EDITORIAL_COPY_LIMITS,
  cleanupEditorialField,
  countWords,
  findBannedPhrases,
  validateMoodOnly,
} from "./film-editorial-copy.mjs";

const PLACEHOLDER_RE =
  /^(tbd|todo|n\/a|na|test|placeholder|coming soon|lorem ipsum)\b/i;

const MACHINE_Y_RE =
  /\b(with a steady (?:pace|rhythm)|with a tense atmosphere|underscored by|marked by|a blend of|raw energy|distinctive visual)\b/i;

const STOCK_OPENING_RE =
  /^(fast-paced and|dark and|quiet and|tense and|darkly comic|warm and|soft and)\b/i;

/**
 * @param {string} text
 */
export function moodOpeningKey(text) {
  const words = String(text ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 2).join(" ");
}

/**
 * @param {string} text
 */
export function normalizeMoodForDedupe(text) {
  return cleanupEditorialField(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jaccard-ish token overlap for near-duplicate detection.
 * @param {string} a
 * @param {string} b
 */
export function moodTokenOverlap(a, b) {
  const ta = new Set(normalizeMoodForDedupe(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalizeMoodForDedupe(b).split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const token of ta) {
    if (tb.has(token)) hit += 1;
  }
  return hit / Math.max(ta.size, tb.size);
}

/**
 * @param {object} film
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function evaluateMoodCorpusCandidate(film) {
  /** @type {string[]} */
  const reasons = [];
  const mood = cleanupEditorialField(film?.the_mood);
  if (!mood) {
    return { ok: false, reasons: ["empty_the_mood"] };
  }
  if (film?.catalog_visible === false) {
    reasons.push("not_catalog_visible");
  }
  if (PLACEHOLDER_RE.test(mood)) {
    reasons.push("placeholder");
  }
  const words = countWords(mood);
  if (words < 4) reasons.push("too_short");
  if (words > EDITORIAL_COPY_LIMITS.the_mood + 4) {
    reasons.push("exceeds_ui_word_budget");
  }
  const banned = [
    ...findBannedPhrases(mood),
    ...BANNED_MOOD_PHRASES.filter((re) => re.test(mood)).map((re) => String(re)),
  ];
  if (banned.length) reasons.push("banned_phrases");

  const moodValidation = validateMoodOnly(mood, film?.synopsis ?? "");
  if (moodValidation.issues.some((issue) => /like|simile|sentence|empty/i.test(issue))) {
    reasons.push("fails_mood_validator");
  }

  if (MACHINE_Y_RE.test(mood) && STOCK_OPENING_RE.test(mood)) {
    reasons.push("stacked_stock_template");
  }

  const hardReasons = reasons.filter((r) =>
    [
      "empty_the_mood",
      "placeholder",
      "too_short",
      "not_catalog_visible",
      "fails_mood_validator",
      "exceeds_ui_word_budget",
      "banned_phrases",
    ].includes(r)
  );

  return {
    ok: hardReasons.length === 0,
    reasons: hardReasons.length ? hardReasons : reasons,
    softFlags: reasons.filter((r) => !hardReasons.includes(r)),
  };
}

/**
 * @param {object[]} films
 */
export function prepareMoodCorpus(films) {
  const rows = Array.isArray(films) ? films : [];
  /** @type {object[]} */
  const excluded = [];
  /** @type {object[]} */
  const candidates = [];

  for (const film of rows) {
    const evalResult = evaluateMoodCorpusCandidate(film);
    if (!evalResult.ok) {
      excluded.push({
        id: film.id,
        title: film.title,
        year: film.year,
        the_mood: film.the_mood,
        reasons: evalResult.reasons,
      });
      continue;
    }
    candidates.push({
      id: film.id,
      title: film.title,
      year: film.year ?? null,
      technique: film.technique ?? null,
      the_mood: cleanupEditorialField(film.the_mood),
      moods: Array.isArray(film.moods) ? film.moods : [],
      synopsis: film.synopsis ?? null,
      softFlags: evalResult.softFlags ?? [],
    });
  }

  // Near-duplicate clustering (keep first, mark rest excluded as near_duplicate)
  /** @type {object[]} */
  const included = [];
  /** @type {object[]} */
  const nearDuplicates = [];
  for (const row of candidates) {
    const dupOf = included.find(
      (kept) => moodTokenOverlap(kept.the_mood, row.the_mood) >= 0.82
    );
    if (dupOf) {
      nearDuplicates.push({
        id: row.id,
        title: row.title,
        the_mood: row.the_mood,
        duplicate_of: dupOf.title,
        overlap: moodTokenOverlap(dupOf.the_mood, row.the_mood),
      });
      excluded.push({
        id: row.id,
        title: row.title,
        year: row.year,
        the_mood: row.the_mood,
        reasons: ["near_duplicate"],
      });
      continue;
    }
    included.push(row);
  }

  /** @type {Record<string, number>} */
  const openingCounts = {};
  for (const row of included) {
    const key = moodOpeningKey(row.the_mood);
    openingCounts[key] = (openingCounts[key] ?? 0) + 1;
  }
  const repeatedOpenings = Object.entries(openingCounts)
    .filter(([, count]) => count >= 3)
    .map(([opening, count]) => ({ opening, count }))
    .sort((a, b) => b.count - a.count);

  /** @type {Record<string, number>} */
  const exclusionReasons = {};
  for (const row of excluded) {
    for (const reason of row.reasons ?? []) {
      exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
    }
  }

  const wordCounts = included.map((row) => countWords(row.the_mood)).sort((a, b) => a - b);
  const median =
    wordCounts.length === 0
      ? 0
      : wordCounts[Math.floor(wordCounts.length / 2)];

  return {
    total_mood_records: rows.filter((f) => cleanupEditorialField(f?.the_mood)).length,
    total_films_scanned: rows.length,
    included_in_corpus: included.length,
    excluded: excluded.length,
    exclusion_reasons: exclusionReasons,
    near_duplicates: nearDuplicates.length,
    near_duplicate_samples: nearDuplicates.slice(0, 15),
    repeated_openings: repeatedOpenings,
    repeated_openings_count: repeatedOpenings.length,
    corpus: included,
    excluded_rows: excluded,
    stats: {
      word_count_min: wordCounts[0] ?? 0,
      word_count_median: median,
      word_count_max: wordCounts[wordCounts.length - 1] ?? 0,
      with_mood_tags: included.filter((row) => row.moods?.length).length,
    },
  };
}

export { BANNED_PHRASES, EDITORIAL_COPY_LIMITS };
