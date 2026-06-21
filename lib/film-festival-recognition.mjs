import { normalizeFilmString } from "./film-duplicate-check.mjs";
import {
  resolveCanonicalFestival,
  resolveConfidenceStatus,
} from "./festival-canonical-identity.mjs";

export const FILM_FESTIVAL_RECOGNITION_TYPES = [
  "official_selection",
  "screening",
  "award",
  "nomination",
];

export const LEGACY_FILM_FESTIVAL_RECOGNITION_TYPES = [
  "winner",
  "nominee",
  "special_mention",
];

export const FILM_FESTIVAL_AWARD_RESULTS = [
  "winner",
  "nominee",
  "jury_prize",
  "grand_prize",
  "mention",
];

/** @deprecated Use award_result */
export const FILM_FESTIVAL_AWARD_LEVELS = [
  "grand_prize",
  "jury_prize",
  "category_award",
  "mention",
];

const RECOGNITION_TYPES_WITH_AWARD_METADATA = new Set([
  "award",
  "nomination",
  "winner",
  "nominee",
  "special_mention",
]);

const RECOGNITION_SIGNAL_WEIGHTS = {
  award: 0.92,
  nomination: 0.78,
  official_selection: 0.55,
  screening: 0,
  winner: 1,
  nominee: 0.78,
  special_mention: 0.72,
};

const AWARD_RESULT_SIGNAL_WEIGHTS = {
  grand_prize: 1,
  winner: 0.95,
  jury_prize: 0.9,
  nominee: 0.78,
  mention: 0.68,
};

/** @deprecated */
const AWARD_LEVEL_SIGNAL_WEIGHTS = AWARD_RESULT_SIGNAL_WEIGHTS;

const MIN_FESTIVAL_YEAR = 1900;
const MAX_FESTIVAL_YEAR = 2100;

/**
 * @typedef {import("../types/film-festival-recognition").FilmFestivalRecognitionInput} FilmFestivalRecognitionInput
 * @typedef {import("../types/film-festival-recognition").FilmFestivalRecognitionImportEntry} FilmFestivalRecognitionImportEntry
 */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeOptionalText(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeFestivalYear(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (parsed < MIN_FESTIVAL_YEAR || parsed > MAX_FESTIVAL_YEAR) {
    return null;
  }

  return parsed;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeSourceUrl(value) {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeRecognitionType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (FILM_FESTIVAL_RECOGNITION_TYPES.includes(normalized)) {
    return normalized;
  }

  if (normalized === "winner" || normalized === "special_mention") {
    return "award";
  }

  if (normalized === "nominee") {
    return "nomination";
  }

  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeAwardResult(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (FILM_FESTIVAL_AWARD_RESULTS.includes(normalized)) {
    return normalized;
  }

  if (normalized === "category_award") {
    return "winner";
  }

  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeAwardLevel(value) {
  const normalized = normalizeAwardResult(value);
  if (normalized === "winner") {
    return "category_award";
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeFestivalName(value) {
  return normalizeFilmString(String(value ?? ""), { stripArticles: true });
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeAwardName(value) {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) {
    return null;
  }

  return normalizeFilmString(trimmed, { stripArticles: true }) || null;
}

/**
 * @param {FilmFestivalRecognitionInput} record
 * @returns {number}
 */
export function getFestivalRecognitionSignalWeight(record) {
  const recognitionType = normalizeRecognitionType(record.recognition_type) ?? "screening";
  const baseWeight = RECOGNITION_SIGNAL_WEIGHTS[recognitionType] ?? 0.35;
  const awardResult = normalizeAwardResult(
    record.award_result ?? record.award_level ?? null
  );

  if (!awardResult) {
    return baseWeight;
  }

  const resultWeight = AWARD_RESULT_SIGNAL_WEIGHTS[awardResult] ?? 0.68;
  return Number((baseWeight * resultWeight).toFixed(4));
}

/**
 * @param {{
 *   festival_name: string,
 *   normalized_festival_name: string,
 *   festival_year: number | null,
 *   recognition_type: string,
 *   normalized_award_name: string | null,
 *   section: string | null,
 * }} record
 * @returns {string}
 */
export function buildFestivalRecognitionDedupeKey(record) {
  return [
    record.normalized_festival_name,
    record.festival_year ?? "unknown-year",
    record.recognition_type,
    record.normalized_award_name ?? "",
    record.section ?? "",
    record.award_result ?? "",
  ].join("|");
}

/**
 * @param {unknown} input
 * @param {{ path?: string }} [options]
 * @returns {{ ok: true, value: FilmFestivalRecognitionInput } | { ok: false, error: string }}
 */
export function parseFilmFestivalRecognitionInput(input, options = {}) {
  const path = options.path ?? "recognition";

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: `${path} must be an object` };
  }

  const festivalName = normalizeOptionalText(input.festival_name);
  if (!festivalName) {
    return { ok: false, error: `${path}.festival_name is required` };
  }

  const recognitionType = normalizeRecognitionType(input.recognition_type);
  if (!recognitionType) {
    return {
      ok: false,
      error: `${path}.recognition_type must be one of ${FILM_FESTIVAL_RECOGNITION_TYPES.join(", ")}`,
    };
  }

  const festivalYear = normalizeFestivalYear(input.festival_year);
  if (
    input.festival_year != null &&
    input.festival_year !== "" &&
    festivalYear == null
  ) {
    return {
      ok: false,
      error: `${path}.festival_year must be an integer between ${MIN_FESTIVAL_YEAR} and ${MAX_FESTIVAL_YEAR}`,
    };
  }

  const section = normalizeOptionalText(input.section);
  const awardName = normalizeOptionalText(input.award_name);
  let awardResult = normalizeAwardResult(input.award_result ?? input.award_level);

  if (
    (input.award_result != null && input.award_result !== "") ||
    (input.award_level != null && input.award_level !== "")
  ) {
    if (awardResult == null) {
      return {
        ok: false,
        error: `${path}.award_result must be one of ${FILM_FESTIVAL_AWARD_RESULTS.join(", ")}`,
      };
    }
  }

  if (recognitionType === "nomination") {
    awardResult = awardResult ?? "nominee";
  }

  if (recognitionType === "award" && !awardResult) {
    awardResult = "winner";
  }

  if (!RECOGNITION_TYPES_WITH_AWARD_METADATA.has(recognitionType)) {
    awardResult = null;
  }

  const legacyAwardLevel =
    awardResult === "winner"
      ? "category_award"
      : awardResult === "grand_prize" ||
          awardResult === "jury_prize" ||
          awardResult === "mention"
        ? awardResult
        : null;

  const sourceUrl = normalizeSourceUrl(input.source_url);
  if (
    input.source_url != null &&
    input.source_url !== "" &&
    sourceUrl == null
  ) {
    return {
      ok: false,
      error: `${path}.source_url must be a valid http(s) URL`,
    };
  }

  const importSource = normalizeOptionalText(input.import_source);
  const importKey = normalizeOptionalText(input.import_key);
  const sourceLabel = normalizeOptionalText(input.source_label);
  const sourceType = normalizeOptionalText(input.source_type);
  const originalText = normalizeOptionalText(input.original_text);

  /** @type {FilmFestivalRecognitionInput} */
  const value = {
    festival_name: festivalName,
    festival_year: festivalYear,
    section,
    recognition_type: recognitionType,
    award_name: awardName,
    award_result: awardResult,
    award_level: legacyAwardLevel,
    source_url: sourceUrl,
    source_label: sourceLabel,
    source_type: sourceType,
    original_text: originalText,
    import_source: importSource,
    import_key: importKey,
  };

  return { ok: true, value };
}

/**
 * @param {FilmFestivalRecognitionInput} input
 * @returns {Record<string, unknown>}
 */
export function toFilmFestivalRecognitionRow(input, filmId) {
  const canonical = resolveCanonicalFestival(input.festival_name);
  const normalizedFestivalName =
    canonical.id ?? normalizeFestivalName(input.festival_name);
  const normalizedAwardName = normalizeAwardName(input.award_name);
  const awardResult = normalizeAwardResult(input.award_result ?? input.award_level);
  const contentDedupeKey = buildFestivalRecognitionDedupeKey({
    festival_name: input.festival_name,
    normalized_festival_name: normalizedFestivalName,
    festival_year: input.festival_year ?? null,
    recognition_type: input.recognition_type,
    normalized_award_name: normalizedAwardName,
    section: input.section ?? null,
    award_result: awardResult,
  });
  const dedupeKey = input.import_key ?? contentDedupeKey;

  const row = {
    film_id: filmId,
    festival_name: canonical.name ?? input.festival_name,
    normalized_festival_name: normalizedFestivalName,
    canonical_festival_id: canonical.id,
    canonical_festival_name: canonical.name,
    source_display_name: canonical.source_display_name ?? input.festival_name,
    festival_year: input.festival_year ?? null,
    section: input.section ?? null,
    recognition_type: input.recognition_type,
    award_name: input.award_name ?? null,
    normalized_award_name: normalizedAwardName,
    award_result: awardResult,
    award_level: input.award_level ?? null,
    source_url: input.source_url ?? null,
    source_label: input.source_label ?? null,
    source_type: input.source_type ?? null,
    original_text: input.original_text ?? null,
    import_source: input.import_source ?? null,
    import_key: input.import_key ?? null,
    dedupe_key: dedupeKey,
  };

  row.confidence_status = resolveConfidenceStatus(row);
  return row;
}

/**
 * @param {unknown[]} recognitions
 * @param {{ path?: string }} [options]
 * @returns {{ ok: true, value: FilmFestivalRecognitionInput[] } | { ok: false, error: string }}
 */
export function parseFilmFestivalRecognitionInputs(recognitions, options = {}) {
  const path = options.path ?? "recognitions";

  if (!Array.isArray(recognitions)) {
    return { ok: false, error: `${path} must be an array` };
  }

  /** @type {FilmFestivalRecognitionInput[]} */
  const parsed = [];

  for (let index = 0; index < recognitions.length; index += 1) {
    const result = parseFilmFestivalRecognitionInput(recognitions[index], {
      path: `${path}[${index}]`,
    });

    if (!result.ok) {
      return result;
    }

    parsed.push(result.value);
  }

  return { ok: true, value: parsed };
}

/**
 * @param {unknown} entry
 * @param {{ path?: string }} [options]
 * @returns {{ ok: true, value: FilmFestivalRecognitionImportEntry } | { ok: false, error: string }}
 */
export function parseFilmFestivalRecognitionImportEntry(entry, options = {}) {
  const path = options.path ?? "entry";

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { ok: false, error: `${path} must be an object` };
  }

  const hasFilmId = isNonEmptyString(entry.film_id);
  const hasFilmMatch =
    entry.film_match &&
    typeof entry.film_match === "object" &&
    !Array.isArray(entry.film_match) &&
    isNonEmptyString(entry.film_match.title);

  if (!hasFilmId && !hasFilmMatch) {
    return {
      ok: false,
      error: `${path} must include film_id or film_match.title`,
    };
  }

  if (hasFilmId && hasFilmMatch) {
    return {
      ok: false,
      error: `${path} must include either film_id or film_match, not both`,
    };
  }

  const parsedRecognitions = parseFilmFestivalRecognitionInputs(
    entry.recognitions,
    { path: `${path}.recognitions` }
  );

  if (!parsedRecognitions.ok) {
    return parsedRecognitions;
  }

  if (parsedRecognitions.value.length === 0) {
    return {
      ok: false,
      error: `${path}.recognitions must contain at least one item`,
    };
  }

  const entryImportSource = normalizeOptionalText(entry.import_source);
  const recognitions = parsedRecognitions.value.map((recognition) => ({
    ...recognition,
    import_source: recognition.import_source ?? entryImportSource,
  }));

  /** @type {FilmFestivalRecognitionImportEntry} */
  const value = {
    recognitions,
    import_source: entryImportSource,
  };

  if (hasFilmId) {
    value.film_id = entry.film_id.trim();
  } else {
    value.film_match = {
      title: entry.film_match.title.trim(),
      year: normalizeFestivalYear(entry.film_match.year),
      original_title: normalizeOptionalText(entry.film_match.original_title),
    };
  }

  return { ok: true, value };
}

/**
 * @param {unknown} payload
 * @returns {{ ok: true, value: FilmFestivalRecognitionImportEntry[] } | { ok: false, error: string }}
 */
export function parseFilmFestivalRecognitionImportPayload(payload) {
  if (Array.isArray(payload)) {
    /** @type {FilmFestivalRecognitionImportEntry[]} */
    const entries = [];

    for (let index = 0; index < payload.length; index += 1) {
      const parsed = parseFilmFestivalRecognitionImportEntry(payload[index], {
        path: `[${index}]`,
      });

      if (!parsed.ok) {
        return parsed;
      }

      entries.push(parsed.value);
    }

    return { ok: true, value: entries };
  }

  if (payload && typeof payload === "object") {
    const parsed = parseFilmFestivalRecognitionImportEntry(payload, {
      path: "payload",
    });

    if (!parsed.ok) {
      return parsed;
    }

    return { ok: true, value: [parsed.value] };
  }

  return {
    ok: false,
    error: "Import payload must be an object or an array of objects",
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} filmId
 * @param {FilmFestivalRecognitionInput[]} recognitions
 */
export async function upsertFilmFestivalRecognitions(supabase, filmId, recognitions) {
  const rows = recognitions.map((recognition) =>
    toFilmFestivalRecognitionRow(recognition, filmId)
  );

  /** @type {Record<string, unknown>[]} */
  const upserted = [];

  for (const row of rows) {
    /** @type {{ id: string } | null} */
    let existing = null;

    if (row.import_source && row.import_key) {
      const { data, error: lookupError } = await supabase
        .from("film_festival_recognitions")
        .select("id")
        .eq("film_id", row.film_id)
        .eq("import_source", row.import_source)
        .eq("import_key", row.import_key)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      existing = data;
    }

    if (!existing?.id && row.dedupe_key) {
      const { data, error: dedupeLookupError } = await supabase
        .from("film_festival_recognitions")
        .select("id")
        .eq("film_id", row.film_id)
        .eq("dedupe_key", row.dedupe_key)
        .maybeSingle();

      if (dedupeLookupError) {
        throw dedupeLookupError;
      }

      existing = data;
    }

    if (existing?.id) {
      const { data, error } = await supabase
        .from("film_festival_recognitions")
        .update(row)
        .eq("id", existing.id)
        .select("*");

      if (error) {
        throw error;
      }

      upserted.push(...(data ?? []));
      continue;
    }

    const { data, error } = await supabase
      .from("film_festival_recognitions")
      .insert(row)
      .select("*");

    if (error) {
      throw error;
    }

    upserted.push(...(data ?? []));
  }

  return upserted;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {FilmFestivalRecognitionImportEntry} entry
 */
export async function resolveFilmIdForFestivalImportEntry(supabase, entry) {
  if (entry.film_id) {
    return entry.film_id;
  }

  const match = entry.film_match;
  if (!match) {
    return null;
  }

  let query = supabase
    .from("films")
    .select("id, title, original_title, year")
    .eq("title", match.title);

  if (match.year != null) {
    query = query.eq("year", match.year);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const candidates = data ?? [];
  if (candidates.length === 1) {
    return candidates[0].id;
  }

  if (match.original_title) {
    const exactOriginal = candidates.filter(
      (film) => film.original_title === match.original_title
    );
    if (exactOriginal.length === 1) {
      return exactOriginal[0].id;
    }
  }

  return null;
}
