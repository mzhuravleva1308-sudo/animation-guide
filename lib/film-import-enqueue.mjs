/**
 * Enqueue films into film_import_queue with active-row dedupe.
 * Identity matches pipeline hard duplicates: normalized title + year
 * (and tmdb_id when present), via normalizeFilmString — same rules as
 * buildFilmIdentity / films_prevent_exact_duplicate.
 */

import { normalizeFilmString } from "./film-duplicate-check.mjs";
import { checkFilmDuplicates } from "./insert-film.mjs";
import { QUEUE_STATUS, WEEKLY_IMPORT_DEFAULTS } from "./film-import-queue.mjs";

export const ENQUEUE_RESULT = {
  ADDED: "added",
  SKIPPED_ALREADY_QUEUED: "skipped_already_queued",
  REPLACED_ACTIVE: "replaced_active",
};

export const ACTIVE_QUEUE_STATUSES = [
  QUEUE_STATUS.PENDING,
  QUEUE_STATUS.PROCESSING,
];

/** Keep aligned with scripts/process-film-batch.mjs parseTmdbId. */
export function parseTmdbIdFromSourceUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/\/movie\/(\d+)(?:[-/?#]|$)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Keep aligned with scripts/process-film-batch.mjs buildFilmIdentity.
 * Used for catalog advisory + tmdb extraction only.
 */
export function buildEnqueueFilmIdentity(film) {
  return {
    title: film.title,
    original_title: film.original_title ?? null,
    director: Array.isArray(film.directors)
      ? film.directors.join(", ")
      : film.director ?? null,
    year: film.year,
    country: Array.isArray(film.countries)
      ? film.countries.join(", ")
      : film.country ?? null,
    duration_minutes: film.runtime_minutes ?? film.duration_minutes ?? null,
    source_url: film.source_urls?.official ?? film.source_urls?.festival ?? null,
    watch_url: null,
    trailer_url: null,
    tmdb_id: parseTmdbIdFromSourceUrl(film.source_urls?.tmdb),
    imdb_id: null,
  };
}

/** Same hard-duplicate key as films_prevent_exact_duplicate / pipeline. */
export function buildFilmImportQueueKey(film) {
  const normalized = normalizeFilmString(String(film?.title ?? ""));
  if (!normalized || film?.year == null) {
    throw new Error(
      `Cannot build queue_key for film without title/year: ${film?.title ?? "?"}`
    );
  }
  return `${normalized}:${film.year}`;
}

export function buildFilmImportQueueRow(film, options = {}) {
  const baseOrder = options.baseOrder ?? Date.now();
  const index = options.index ?? 0;
  const identity = buildEnqueueFilmIdentity(film);
  return {
    title: film.title,
    year: film.year,
    payload: film,
    queue_key: buildFilmImportQueueKey(film),
    tmdb_id: identity.tmdb_id ?? null,
    status: QUEUE_STATUS.PENDING,
    attempts: 0,
    max_attempts: options.maxAttempts ?? WEEKLY_IMPORT_DEFAULTS.maxAttempts,
    sort_order: baseOrder + index,
  };
}

export function isUniqueViolation(error) {
  if (!error) return false;
  const code = error.code ?? error?.details ?? "";
  const message = String(error.message ?? error);
  return (
    code === "23505" ||
    /duplicate key|unique constraint|film_import_queue_active_/i.test(message)
  );
}

/**
 * In-memory active-queue store used by unit tests (unique index analogue).
 */
export function createInMemoryQueueStore(seed = []) {
  return {
    rows: seed.map((row) => ({ ...row })),
  };
}

function findActiveByIdentity(store, row) {
  return store.rows.find(
    (existing) =>
      ACTIVE_QUEUE_STATUSES.includes(existing.status) &&
      (existing.queue_key === row.queue_key ||
        (row.tmdb_id != null &&
          existing.tmdb_id != null &&
          existing.tmdb_id === row.tmdb_id))
  );
}

/**
 * Pure enqueue into an in-memory store — models DB unique active indexes.
 */
export function enqueueFilmIntoMemoryStore(store, film, options = {}) {
  const row = buildFilmImportQueueRow(film, options);
  const existing = findActiveByIdentity(store, row);

  if (existing) {
    if (options.replaceActive) {
      existing.payload = row.payload;
      existing.title = row.title;
      existing.year = row.year;
      existing.queue_key = row.queue_key;
      existing.tmdb_id = row.tmdb_id;
      existing.updated_at = new Date().toISOString();
      return {
        status: ENQUEUE_RESULT.REPLACED_ACTIVE,
        row: { ...existing },
        existingId: existing.id,
      };
    }
    return {
      status: ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED,
      row: { ...existing },
      existingId: existing.id,
    };
  }

  const inserted = {
    ...row,
    id: options.id ?? `queue-${store.rows.length + 1}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.rows.push(inserted);
  return { status: ENQUEUE_RESULT.ADDED, row: inserted };
}

/**
 * Parallel-safe memory claim: two writers racing the same key — only one adds.
 */
export function enqueueFilmIntoMemoryStoreExclusive(store, film, options = {}) {
  const row = buildFilmImportQueueRow(film, options);
  const lockKeys = [row.queue_key];
  if (row.tmdb_id != null) lockKeys.push(`tmdb:${row.tmdb_id}`);
  store.locks ??= new Set();

  if (
    lockKeys.some((key) => store.locks.has(key)) ||
    findActiveByIdentity(store, row)
  ) {
    const existing = findActiveByIdentity(store, row);
    return {
      status: ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED,
      row: existing ?? row,
      existingId: existing?.id ?? null,
    };
  }

  for (const key of lockKeys) store.locks.add(key);
  try {
    const existing = findActiveByIdentity(store, row);
    if (existing) {
      return {
        status: ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED,
        row: existing,
        existingId: existing.id,
      };
    }
    return enqueueFilmIntoMemoryStore(store, film, options);
  } finally {
    for (const key of lockKeys) store.locks.delete(key);
  }
}

export function summarizeEnqueueResults(results) {
  const added = results.filter((row) => row.status === ENQUEUE_RESULT.ADDED);
  const skipped = results.filter(
    (row) => row.status === ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED
  );
  const replaced = results.filter(
    (row) => row.status === ENQUEUE_RESULT.REPLACED_ACTIVE
  );
  return {
    addedCount: added.length,
    skippedCount: skipped.length,
    replacedCount: replaced.length,
    total: results.length,
  };
}

export function formatEnqueueSummary(results, batchName) {
  const summary = summarizeEnqueueResults(results);
  const lines = [
    `Enqueue summary for "${batchName}": added=${summary.addedCount}, skipped_already_queued=${summary.skippedCount}, replaced_active=${summary.replacedCount}`,
  ];
  for (const result of results) {
    const title = result.filmTitle ?? result.row?.title ?? "?";
    const year = result.filmYear ?? result.row?.year ?? "?";
    if (result.status === ENQUEUE_RESULT.ADDED) {
      lines.push(`[added] ${title} (${year}) ${result.row?.id ?? ""}`.trim());
    } else if (result.status === ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED) {
      lines.push(
        `[skipped_already_queued] ${title} (${year}) active=${result.existingId ?? result.row?.id ?? "?"}`
      );
    } else if (result.status === ENQUEUE_RESULT.REPLACED_ACTIVE) {
      lines.push(
        `[replaced_active] ${title} (${year}) ${result.existingId ?? result.row?.id ?? ""}`.trim()
      );
    }
    if (result.catalogNote) {
      lines.push(`  note: ${result.catalogNote}`);
    }
  }
  return { summary, text: `${lines.join("\n")}\n` };
}

async function findActiveQueueRow(supabase, row) {
  const { data: byKey, error: keyError } = await supabase
    .from("film_import_queue")
    .select("id,title,year,status,queue_key,tmdb_id")
    .eq("queue_key", row.queue_key)
    .in("status", ACTIVE_QUEUE_STATUSES)
    .maybeSingle();
  if (keyError) throw keyError;
  if (byKey) return byKey;

  if (row.tmdb_id != null) {
    const { data: byTmdb, error: tmdbError } = await supabase
      .from("film_import_queue")
      .select("id,title,year,status,queue_key,tmdb_id")
      .eq("tmdb_id", row.tmdb_id)
      .in("status", ACTIVE_QUEUE_STATUSES)
      .maybeSingle();
    if (tmdbError) throw tmdbError;
    if (byTmdb) return byTmdb;
  }
  return null;
}

async function catalogAdvisoryNote(supabase, film) {
  try {
    const identity = buildEnqueueFilmIdentity(film);
    const report = await checkFilmDuplicates(supabase, identity);
    const hard = report.matches.find((match) => match.isHardDuplicate);
    if (!hard) return null;
    const existingId = hard.existingFilm?.id ?? "?";
    const reasons = (hard.reasons ?? []).join("; ");
    return `already in catalog as ${existingId} (${reasons}); will become duplicate_skipped at import time`;
  } catch (error) {
    console.warn(
      `Catalog advisory check skipped: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

/**
 * Enqueue one validated film object into Supabase film_import_queue.
 */
export async function enqueueOneFilm(supabase, film, options = {}) {
  const row = buildFilmImportQueueRow(film, options);
  const catalogNote = options.skipCatalogAdvisory
    ? null
    : await catalogAdvisoryNote(supabase, film);

  const existing = await findActiveQueueRow(supabase, row);
  if (existing) {
    if (options.replaceActive) {
      const { data, error } = await supabase
        .from("film_import_queue")
        .update({
          title: row.title,
          year: row.year,
          payload: row.payload,
          queue_key: row.queue_key,
          tmdb_id: row.tmdb_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .in("status", ACTIVE_QUEUE_STATUSES)
        .select("id,title,year,status,queue_key,sort_order")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          status: ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED,
          filmTitle: film.title,
          filmYear: film.year,
          existingId: existing.id,
          row: existing,
          catalogNote,
        };
      }
      return {
        status: ENQUEUE_RESULT.REPLACED_ACTIVE,
        filmTitle: film.title,
        filmYear: film.year,
        existingId: data.id,
        row: data,
        catalogNote,
      };
    }

    return {
      status: ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED,
      filmTitle: film.title,
      filmYear: film.year,
      existingId: existing.id,
      row: existing,
      catalogNote,
    };
  }

  const { data, error } = await supabase
    .from("film_import_queue")
    .insert(row)
    .select("id,title,year,status,queue_key,sort_order")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await findActiveQueueRow(supabase, row);
      return {
        status: ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED,
        filmTitle: film.title,
        filmYear: film.year,
        existingId: raced?.id ?? null,
        row: raced ?? row,
        catalogNote,
      };
    }
    throw error;
  }

  return {
    status: ENQUEUE_RESULT.ADDED,
    filmTitle: film.title,
    filmYear: film.year,
    row: data,
    catalogNote,
  };
}

/**
 * Enqueue all films from a validated import batch.
 */
export async function enqueueFilmImportBatch({
  supabase,
  batch,
  options = {},
}) {
  const films = batch.films ?? [];
  const baseOrder = options.baseOrder ?? Date.now();
  const results = [];

  for (let index = 0; index < films.length; index += 1) {
    const film = films[index];
    const result = await enqueueOneFilm(supabase, film, {
      ...options,
      baseOrder,
      index,
    });
    results.push(result);
  }

  return {
    batchName: batch.batch_name,
    results,
    ...summarizeEnqueueResults(results),
    reportText: formatEnqueueSummary(results, batch.batch_name).text,
  };
}
