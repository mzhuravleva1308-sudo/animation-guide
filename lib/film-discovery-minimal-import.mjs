/**
 * Minimal seed import into film_discovery_candidates (not public.films).
 * Allowed fields only: title, original_title, year, directors, countries, runtime_minutes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import {
  DISCOVERY_REVIEW_STATUS,
  DISCOVERY_SOURCE,
} from "./film-discovery.mjs";
import {
  findCatalogIdentityDuplicate,
  normalizeStringList,
} from "./film-discovery-eligibility.mjs";
import { normalizeFilmString } from "./film-duplicate-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = path.join(
  root,
  "schemas",
  "film-discovery-minimal-batch.schema.json"
);

/** Fields that must never be written from a minimal seed file. */
export const FORBIDDEN_MINIMAL_IMPORT_FIELDS = Object.freeze([
  "synopsis",
  "the_mood",
  "technique",
  "festival_recognitions",
  "source_urls",
  "notes",
  "quick_filters",
  "poster",
  "poster_url",
  "trailer",
  "trailer_url",
  "availability",
  "light",
  "shadow",
  "sci_fi",
  "award_winner",
]);

/**
 * @param {object} film
 */
export function assertNoForbiddenMinimalFields(film) {
  const present = FORBIDDEN_MINIMAL_IMPORT_FIELDS.filter((key) =>
    Object.prototype.hasOwnProperty.call(film, key)
  );
  if (present.length > 0) {
    throw new Error(
      `Minimal import forbids extra fields: ${present.join(", ")}`
    );
  }
}

/**
 * @param {object} film
 */
export function buildMinimalCandidateRow(film) {
  assertNoForbiddenMinimalFields(film);
  return {
    source: DISCOVERY_SOURCE.manualSeed,
    title: String(film.title).trim(),
    original_title:
      film.original_title == null || film.original_title === ""
        ? null
        : String(film.original_title).trim(),
    year: film.year,
    directors: normalizeStringList(film.directors),
    countries: normalizeStringList(film.countries),
    runtime_minutes: film.runtime_minutes,
    source_urls: [],
    manager_why: null,
    researcher_why: null,
    eligibility_evidence: {},
    eligibility_result: null,
    eligibility_reasons: [],
    eligibility_missing: [],
    eligibility_fix_hints: [],
    review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
    batch_id: null,
  };
}

/**
 * @param {object} batch
 * @param {object} schema
 */
export function validateMinimalDiscoveryBatch(batch, schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(batch);
  /** @type {string[]} */
  const errors = [];

  if (!ok) {
    for (const err of validate.errors ?? []) {
      errors.push(`${err.instancePath || "/"} ${err.message}`);
    }
  }

  const films = Array.isArray(batch?.films) ? batch.films : [];
  /** @type {Map<string, number>} */
  const seenTitleYear = new Map();
  /** @type {Map<string, number>} */
  const seenOriginalYear = new Map();
  /** Exact raw original_title+year when normalize yields "" (non-Latin scripts). */
  /** @type {Map<string, number>} */
  const seenRawOriginalYear = new Map();

  films.forEach((film, index) => {
    try {
      assertNoForbiddenMinimalFields(film);
    } catch (error) {
      errors.push(`films[${index}]: ${error.message}`);
    }

    const titleKey = `${normalizeFilmString(film.title)}:${film.year}`;
    if (seenTitleYear.has(titleKey)) {
      errors.push(
        `films[${index}]: duplicate title+year within batch (also films[${seenTitleYear.get(titleKey)}])`
      );
    } else {
      seenTitleYear.set(titleKey, index);
    }

    if (film.original_title) {
      const rawOriginal = String(film.original_title).trim();
      const normalizedOriginal = normalizeFilmString(film.original_title);

      // Empty after normalize (typical for CJK/Hangul): skip normalize-based
      // original_title+year dedupe so unrelated films in the same year do not collide.
      if (normalizedOriginal) {
        const originalKey = `${normalizedOriginal}:${film.year}`;
        if (seenOriginalYear.has(originalKey)) {
          errors.push(
            `films[${index}]: duplicate original_title+year within batch (also films[${seenOriginalYear.get(originalKey)}])`
          );
        } else {
          seenOriginalYear.set(originalKey, index);
        }
      } else if (rawOriginal) {
        // Still catch identical raw non-Latin originals in the same year.
        const rawKey = `${rawOriginal}:${film.year}`;
        if (seenRawOriginalYear.has(rawKey)) {
          errors.push(
            `films[${index}]: duplicate original_title+year within batch (also films[${seenRawOriginalYear.get(rawKey)}])`
          );
        } else {
          seenRawOriginalYear.set(rawKey, index);
        }
      }
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    filmCount: films.length,
  };
}

/**
 * @param {object} batch
 * @param {{
 *   catalogFilms?: object[],
 *   existingCandidates?: object[],
 * }} [options]
 */
export function planMinimalDiscoveryImport(batch, options = {}) {
  const films = batch.films ?? [];
  /** @type {object[]} */
  const toInsert = [];
  /** @type {object[]} */
  const skippedDuplicates = [];
  /** @type {object[]} */
  const rows = [];

  for (const film of films) {
    const row = buildMinimalCandidateRow(film);
    const dup = findCatalogIdentityDuplicate(row, [
      ...(options.catalogFilms ?? []),
      ...(options.existingCandidates ?? []),
      ...toInsert,
    ]);
    if (dup) {
      skippedDuplicates.push({
        title: row.title,
        year: row.year,
        reason: dup.kind,
        against: dup.film.title,
      });
      continue;
    }
    toInsert.push(row);
    rows.push(row);
  }

  return {
    batch_name: batch.batch_name,
    total: films.length,
    would_insert: rows.length,
    skipped_duplicates: skippedDuplicates,
    rows,
    writes_to_films_table: false,
    sets_catalog_visible: false,
    runs_enrichment: false,
    appears_in_public_catalog: false,
  };
}

/**
 * Dry run never mutates hosted DB — callers must not pass a write client when dryRun.
 * @param {object} input
 * @param {object} input.batch
 * @param {object} input.schema
 * @param {object[]} [input.catalogFilms]
 * @param {object[]} [input.existingCandidates]
 * @param {boolean} [input.dryRun]
 * @param {(rows: object[]) => Promise<unknown>} [input.insertFn]
 */
export async function runMinimalDiscoveryImport(input) {
  const validation = validateMinimalDiscoveryBatch(input.batch, input.schema);
  if (!validation.ok) {
    return {
      ok: false,
      validation,
      plan: null,
      inserted: 0,
      dryRun: Boolean(input.dryRun),
      databaseMutated: false,
    };
  }

  const plan = planMinimalDiscoveryImport(input.batch, {
    catalogFilms: input.catalogFilms,
    existingCandidates: input.existingCandidates,
  });

  if (input.dryRun) {
    return {
      ok: true,
      validation,
      plan,
      inserted: 0,
      dryRun: true,
      databaseMutated: false,
    };
  }

  if (!input.insertFn) {
    throw new Error("insertFn is required when dryRun is false");
  }

  await input.insertFn(plan.rows);
  return {
    ok: true,
    validation,
    plan,
    inserted: plan.rows.length,
    dryRun: false,
    databaseMutated: true,
  };
}

export async function loadMinimalDiscoverySchema() {
  return JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8"));
}

export { SCHEMA_PATH };
