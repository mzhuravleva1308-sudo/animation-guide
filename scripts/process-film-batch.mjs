import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { buildVideoLanguageList } from "../lib/tmdb-film-matching.mjs";
import { checkFilmDuplicates } from "../lib/insert-film.mjs";
import { normalizeRecognitionRow } from "../lib/festival-recognition-normalization.mjs";
import { resolveCatalogVisibleForImport } from "../lib/public-catalog-films.mjs";
import {
  describeMissingStoragePoster,
  isCachedPosterUrl,
} from "../lib/film-poster.mjs";
import { validateFile } from "./validate-film-import-batch.mjs";

applyAppEnv();

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const configuredEmbeddingDimensions = Number(
  process.env.OPENAI_EMBEDDING_DIMENSIONS
);
const EMBEDDING_DIMENSIONS =
  Number.isInteger(configuredEmbeddingDimensions) &&
  configuredEmbeddingDimensions > 0
    ? configuredEmbeddingDimensions
    : null;
const FILM_SELECT =
  "id,title,year,synopsis,the_mood,technique,moods,aesthetic_tags,image_url,poster_url,external_image_url,trailer_url";
const IMMUTABLE_FIELDS = [
  "synopsis",
  "the_mood",
  "technique",
  "image_url",
  "external_image_url",
  "poster_url",
  "trailer_url",
];

function parseArgs(argv) {
  const options = {
    filmIds: [],
    file: null,
    dryRun: false,
    execute: false,
    skipMedia: false,
    waitForJobs: false,
    rebuildAllProfiles: false,
    timeoutMs: 10 * 60 * 1000,
    pollMs: 5000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--film-ids" || arg === "--film-ids=") {
      const value = arg === "--film-ids" ? argv[++index] : "";
      if (!value) throw new Error("Missing value for --film-ids");
      options.filmIds.push(...value.split(",").map((id) => id.trim()).filter(Boolean));
    } else if (arg.startsWith("--film-ids=")) {
      options.filmIds.push(
        ...arg.slice("--film-ids=".length).split(",").map((id) => id.trim()).filter(Boolean)
      );
    } else if (arg === "--file") {
      options.file = argv[++index];
      if (!options.file) throw new Error("Missing value for --file");
    } else if (arg.startsWith("--file=")) {
      options.file = arg.slice("--file=".length);
      if (!options.file) throw new Error("Missing value for --file");
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") options.execute = true;
    else if (arg === "--skip-media") options.skipMedia = true;
    else if (arg === "--wait-for-jobs") options.waitForJobs = true;
    else if (arg === "--rebuild-all-profiles") options.rebuildAllProfiles = true;
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (arg === "--poll-ms") options.pollMs = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.dryRun === options.execute) {
    throw new Error("Pass exactly one of --dry-run or --execute");
  }
  if (options.file && options.filmIds.length) {
    throw new Error("Use either --file or --film-ids, not both");
  }
  if (!options.file && !options.filmIds.length) {
    throw new Error("Pass --file <path> or --film-ids <uuid,...>");
  }
  if (options.file) return options;
  if (new Set(options.filmIds).size !== options.filmIds.length) {
    throw new Error("Duplicate film UUIDs are not allowed");
  }
  for (const id of options.filmIds) {
    if (!UUID_RE.test(id)) throw new Error(`Invalid film UUID: ${id}`);
  }
  return options;
}

function nonEmpty(value) {
  return typeof value === "string" ? Boolean(value.trim()) : value != null;
}

function hasTags(value) {
  return Array.isArray(value) && value.some((tag) => String(tag).trim());
}

function parseEmbedding(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((item) => Number(item.trim()));
  }
}

function validEmbedding(value, expectedDimensions = EMBEDDING_DIMENSIONS) {
  const vector = parseEmbedding(value);
  return (
    Array.isArray(vector) &&
    vector.length > 0 &&
    vector.every(Number.isFinite) &&
    (expectedDimensions == null || vector.length === expectedDimensions)
  );
}

function stableValue(value) {
  return JSON.stringify(value ?? null);
}

function snapshotFilm(film) {
  return Object.fromEntries(
    IMMUTABLE_FIELDS
      .filter((field) => nonEmpty(film[field]))
      .map((field) => [field, stableValue(film[field])])
  );
}

/** Only previously non-empty immutable fields must stay unchanged. */
function immutableFieldsChanged(before, after) {
  for (const [field, value] of Object.entries(before)) {
    if (value !== stableValue(after[field])) {
      return true;
    }
  }
  return false;
}

function resolveSupabaseUrl(options = {}) {
  return options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function hasStoragePoster(film, options = {}) {
  return isCachedPosterUrl(film?.poster_url, resolveSupabaseUrl(options));
}

function readiness(film, moodEmbedding, aestheticEmbedding, options = {}) {
  const metadata = ["title", "year", "synopsis", "the_mood", "technique"].every(
    (field) => nonEmpty(film[field])
  );
  const moods = hasTags(film.moods);
  const aestheticTags = hasTags(film.aesthetic_tags);
  // Catalog requires a Storage-backed poster_url; external image_url is not enough.
  const image = hasStoragePoster(film, options);
  const rankingReady = moods && aestheticTags && moodEmbedding && aestheticEmbedding;
  return {
    metadata,
    moods,
    aestheticTags,
    moodEmbedding,
    aestheticEmbedding,
    image,
    video: nonEmpty(film.trailer_url),
    rankingReady,
    catalogReady: rankingReady && metadata && image,
  };
}

function assertStoragePosters(films, options = {}) {
  const missing = films.filter((film) => !hasStoragePoster(film, options));
  if (!missing.length) {
    return;
  }

  throw new Error(
    `Storage poster required after media stage:\n${missing
      .map((film) => `- ${describeMissingStoragePoster(film)}`)
      .join("\n")}`
  );
}

function logFilm(stage, film, message) {
  console.log(`[${stage}] ${film.title} — ${message}`);
}

async function runScopedScript(script, filmIds, dryRun) {
  const args = ["--film-ids", filmIds.join(",")];
  if (dryRun) args.push("--dry-run");
  try {
    const result = await execFileAsync(process.execPath, [path.join(SCRIPT_DIR, script), ...args], {
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw new Error(`${script} failed: ${error.message}`);
  }
}

async function query(supabase, table, select, apply) {
  let request = supabase.from(table).select(select);
  if (apply) request = apply(request);
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

async function loadState(supabase, filmIds) {
  const films = await query(supabase, "films", FILM_SELECT, (q) =>
    q.in("id", filmIds)
  );
  if (films.length !== filmIds.length) {
    const found = new Set(films.map((film) => film.id));
    throw new Error(
      `Unknown film UUID(s): ${filmIds.filter((id) => !found.has(id)).join(", ")}`
    );
  }
  const [moodRows, aestheticRows, recognitions] = await Promise.all([
    query(supabase, "film_mood_embeddings", "film_id,embedding,mood_text", (q) =>
      q.in("film_id", filmIds)
    ),
    query(
      supabase,
      "film_aesthetic_embeddings",
      "film_id,embedding,aesthetic_text",
      (q) => q.in("film_id", filmIds)
    ),
    query(
      supabase,
      "film_festival_recognitions",
      "film_id,id,festival_name,festival_year,section,recognition_type,award_name,award_level,source_url,dedupe_key,updated_at",
      (q) => q.in("film_id", filmIds).order("id")
    ),
  ]);
  const moodById = new Map(moodRows.map((row) => [row.film_id, row]));
  const aestheticById = new Map(aestheticRows.map((row) => [row.film_id, row]));
  return {
    films: filmIds.map((id) => films.find((film) => film.id === id)),
    moodById,
    aestheticById,
    recognitions,
  };
}

async function readProfiles(supabase) {
  return query(supabase, "profiles", "id,slug,name", (q) => q.order("slug"));
}

async function enqueueProfiles(supabase, profiles) {
  const now = new Date().toISOString();
  const existing = await query(
    supabase,
    "profile_score_rebuild_jobs",
    "profile_id,generation",
    (q) => q.in("profile_id", profiles.map((profile) => profile.id))
  );
  const generationById = new Map(
    existing.map((job) => [job.profile_id, Number(job.generation) + 1])
  );
  const rows = profiles.map((profile) => ({
    profile_id: profile.id,
    scheduled_at: now,
    status: "pending",
    generation: generationById.get(profile.id) ?? 1,
    attempts: 0,
    locked_at: null,
    last_error: null,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("profile_score_rebuild_jobs")
    .upsert(rows, { onConflict: "profile_id" });
  if (error) throw error;
  return rows;
}

async function waitForJobs(supabase, jobs, options) {
  const deadline = Date.now() + options.timeoutMs;
  const ids = jobs.map((job) => job.profile_id);
  while (Date.now() < deadline) {
    const rows = await query(
      supabase,
      "profile_score_rebuild_jobs",
      "profile_id,generation,status,last_error,updated_at",
      (q) => q.in("profile_id", ids)
    );
    const byId = new Map(rows.map((row) => [row.profile_id, row]));
    const failed = jobs
      .map((job) => byId.get(job.profile_id))
      .filter((job) => job?.last_error);
    if (failed.length) {
      throw new Error(
        `Profile jobs failed: ${failed
          .map((job) => `${job.profile_id}: ${job.last_error}`)
          .join("; ")}`
      );
    }
    if (
      jobs.every((job) => {
        const current = byId.get(job.profile_id);
        return (
          current?.generation === job.generation &&
          current?.status === "completed"
        );
      })
    ) {
      return;
    }
    await options.sleep(options.pollMs);
  }
  throw new Error(`Timed out waiting for ${jobs.length} profile job(s)`);
}

async function verifyCoverage(supabase, profiles, filmIds) {
  const rows = await query(
    supabase,
    "profile_film_scores",
    "profile_id,film_id",
    (q) => q.in("profile_id", profiles.map((profile) => profile.id)).in("film_id", filmIds)
  );
  const existing = new Set(rows.map((row) => `${row.profile_id}:${row.film_id}`));
  const missing = [];
  for (const profile of profiles) {
    for (const filmId of filmIds) {
      if (!existing.has(`${profile.id}:${filmId}`)) {
        missing.push(`${profile.slug ?? profile.id}:${filmId}`);
      }
    }
  }
  if (missing.length) {
    throw new Error(`Missing profile × film score rows: ${missing.join(", ")}`);
  }
}

function printTable(films, states) {
  console.log(
    "\n| Film | metadata | moods | aesthetic tags | mood embedding | aesthetic embedding | image | video | ranking-ready | catalog-ready |"
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const film of films) {
    const state = states.get(film.id);
    console.log(
      `| ${film.title} | ${state.metadata ? "yes" : "no"} | ${
        state.moods ? "yes" : "no"
      } | ${state.aestheticTags ? "yes" : "no"} | ${
        state.moodEmbedding ? "yes" : "no"
      } | ${state.aestheticEmbedding ? "yes" : "no"} | ${
        state.image ? "yes" : "no"
      } | ${state.video ? "yes" : "no"} | ${
        state.rankingReady ? "yes" : "no"
      } | ${state.catalogReady ? "yes" : "no"} |`
    );
  }
}

function parseTmdbId(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/\/movie\/(\d+)(?:[-/?#]|$)/i);
  return match ? Number(match[1]) : null;
}

function buildFilmIdentity(film) {
  return {
    title: film.title,
    original_title: film.original_title ?? null,
    director: film.directors.join(", "),
    year: film.year,
    country: film.countries.join(", "),
    duration_minutes: film.runtime_minutes ?? null,
    source_url: film.source_urls.official ?? film.source_urls.festival ?? null,
    watch_url: null,
    trailer_url: null,
    tmdb_id: parseTmdbId(film.source_urls.tmdb),
    imdb_id: null,
  };
}

function buildFilmInsertPayload(film) {
  const identity = buildFilmIdentity(film);
  return {
    title: identity.title,
    original_title: identity.original_title,
    director: identity.director,
    year: identity.year,
    country: identity.country,
    duration_minutes: identity.duration_minutes,
    source_url: identity.source_url,
    synopsis: film.synopsis,
    technique: film.technique.join(", "),
    the_mood: film.the_mood,
    tmdb_id: identity.tmdb_id,
    quick_filters: film.quick_filters ?? [],
    catalog_visible: resolveCatalogVisibleForImport(film),
  };
}

const RECOGNITION_INSERT_FIELDS = [
  "film_id",
  "festival_name",
  "normalized_festival_name",
  "canonical_festival_id",
  "canonical_festival_name",
  "festival_year",
  "section",
  "recognition_type",
  "award_name",
  "normalized_award_name",
  "award_result",
  "award_level",
  "source_url",
  "source_label",
  "source_type",
  "original_text",
  "import_source",
  "import_key",
  "dedupe_key",
  "confidence_status",
];

function buildRecognitionInsertPayload(filmId, recognition) {
  const normalized = normalizeRecognitionRow({
    ...recognition,
    film_id: filmId,
    recognition_type:
      recognition.recognition_type === "selection"
        ? "official_selection"
        : recognition.recognition_type,
    import_source: "film-import-batch",
  });

  return Object.fromEntries(
    RECOGNITION_INSERT_FIELDS.map((field) => [field, normalized[field] ?? null])
  );
}

function buildImportPlan(batch, plannedFilmId = "<planned-film-uuid>") {
  return batch.films.map((film) => ({
    input: film,
    identity: buildFilmIdentity(film),
    filmPayload: buildFilmInsertPayload(film),
    recognitionPayloads: film.festival_recognitions.map((recognition) =>
      buildRecognitionInsertPayload(plannedFilmId, recognition)
    ),
  }));
}

export const FILM_STATUS = {
  RANKING_READY: "ranking_ready",
  CATALOG_READY: "catalog_ready",
  DUPLICATE_SKIPPED: "duplicate_skipped",
  FAILED_ROLLED_BACK: "failed_rolled_back",
};

export const EXIT = {
  SUCCESS: 0,
  FATAL: 1,
  PARTIAL: 2,
};

export function resolveBatchExitCode(results) {
  const failed = results.filter(
    (row) => row.status === FILM_STATUS.FAILED_ROLLED_BACK
  );
  const successful = results.filter(
    (row) =>
      row.status === FILM_STATUS.RANKING_READY ||
      row.status === FILM_STATUS.CATALOG_READY
  );
  if (failed.length === 0) return EXIT.SUCCESS;
  if (successful.length === 0) return EXIT.FATAL;
  return EXIT.PARTIAL;
}

async function classifyImportPlan(supabase, batch) {
  const plan = buildImportPlan(batch);
  /** @type {{ item: ReturnType<typeof buildImportPlan>[number], duplicate: null | { existingFilmId: string, reason: string } }[]} */
  const classified = [];

  for (const item of plan) {
    const duplicateReport = await checkFilmDuplicates(supabase, item.identity);
    if (duplicateReport.matches.length) {
      const match =
        duplicateReport.matches.find((entry) => entry.isHardDuplicate) ??
        duplicateReport.matches[0];
      classified.push({
        item,
        duplicate: {
          existingFilmId: match.existingFilm.id,
          reason: match.reasons.join("; "),
        },
      });
    } else {
      classified.push({ item, duplicate: null });
    }
  }

  return classified;
}

function printImportPlan(classified, profiles) {
  console.log("\nImport plan (no writes):");
  for (const entry of classified) {
    const title = entry.item.input.title;
    if (entry.duplicate) {
      console.log(
        `[duplicate_skipped] ${title} — existing UUID ${entry.duplicate.existingFilmId} (${entry.duplicate.reason})`
      );
      continue;
    }
    console.log(`Film row: ${JSON.stringify(entry.item.filmPayload, null, 2)}`);
    for (const recognition of entry.item.recognitionPayloads) {
      console.log(
        `Festival recognition row: ${JSON.stringify(recognition, null, 2)}`
      );
    }
    console.log(`[planned] ${title} — import → enrich → embed → media → readiness`);
  }
  const wouldImport = classified.filter((entry) => !entry.duplicate).length;
  console.log(
    `\nEnqueue after successful films: ${
      wouldImport > 0 ? "planned once" : "skipped (no importable films)"
    } (${profiles.map((profile) => profile.slug ?? profile.id).join(", ")})`
  );
}

function printBatchReport(results) {
  console.log("\nBatch film statuses:");
  for (const row of results) {
    const uuid = row.filmId ?? row.existingFilmId ?? "—";
    const error = row.error ? ` — ${row.error}` : "";
    console.log(`- ${row.title}: ${row.status} (${uuid})${error}`);
  }
  const successful = results.filter(
    (row) =>
      row.status === FILM_STATUS.RANKING_READY ||
      row.status === FILM_STATUS.CATALOG_READY
  );
  const duplicates = results.filter(
    (row) => row.status === FILM_STATUS.DUPLICATE_SKIPPED
  );
  const failed = results.filter(
    (row) => row.status === FILM_STATUS.FAILED_ROLLED_BACK
  );
  console.log(
    `Summary: successful=${successful.length}, duplicate_skipped=${duplicates.length}, failed_rolled_back=${failed.length}`
  );
}

/** Rollback only rows created for this attempt's film UUID. */
async function rollbackCreatedFilm(supabase, filmId) {
  if (!filmId) return;
  const rollbackErrors = [];
  for (const table of [
    "film_festival_recognitions",
    "film_mood_embeddings",
    "film_aesthetic_embeddings",
  ]) {
    const { error } = await supabase.from(table).delete().eq("film_id", filmId);
    if (error) rollbackErrors.push(`${table}: ${error.message}`);
  }
  const { error: filmError } = await supabase
    .from("films")
    .delete()
    .eq("id", filmId);
  if (filmError) rollbackErrors.push(`films: ${filmError.message}`);
  if (rollbackErrors.length) {
    throw new Error(`Import rollback failed for ${filmId}: ${rollbackErrors.join("; ")}`);
  }
}

async function importOneFilm(supabase, item) {
  const { data: film, error: filmError } = await supabase
    .from("films")
    .insert(item.filmPayload)
    .select("id")
    .single();
  if (filmError) throw filmError;
  if (!film?.id) {
    throw new Error(`Film insert returned no UUID for ${item.input.title}`);
  }

  try {
    for (const recognition of item.recognitionPayloads) {
      const { error: recognitionError } = await supabase
        .from("film_festival_recognitions")
        .insert({ ...recognition, film_id: film.id });
      if (recognitionError) throw recognitionError;
    }
  } catch (error) {
    await rollbackCreatedFilm(supabase, film.id);
    throw error;
  }

  return film.id;
}

/** @deprecated kept for tests that import a whole plan atomically */
async function executeImportPlan(supabase, plan) {
  const imported = [];
  try {
    for (const item of plan) {
      const filmId = await importOneFilm(supabase, item);
      imported.push({ filmId, title: item.input.title });
    }
    return imported;
  } catch (error) {
    for (const item of [...imported].reverse()) {
      await rollbackCreatedFilm(supabase, item.filmId);
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; imported rows rolled back`
    );
  }
}

async function rollbackImportedRows(supabase, imported) {
  for (const item of [...imported].reverse()) {
    await rollbackCreatedFilm(supabase, item.filmId);
  }
}

export async function processFilmImportBatch({
  supabase,
  batch,
  options,
  pipeline = processFilmBatch,
  enqueue = enqueueProfiles,
} = {}) {
  const profiles = await readProfiles(supabase);
  const classified = await classifyImportPlan(supabase, batch);

  if (options.dryRun) {
    printImportPlan(classified, profiles);
    const results = classified.map((entry) =>
      entry.duplicate
        ? {
            title: entry.item.input.title,
            status: FILM_STATUS.DUPLICATE_SKIPPED,
            existingFilmId: entry.duplicate.existingFilmId,
            error: null,
          }
        : {
            title: entry.item.input.title,
            status: "planned_import",
            filmId: null,
            error: null,
          }
    );
    return {
      dryRun: true,
      results,
      profiles,
      exitCode: EXIT.SUCCESS,
      enqueueCalled: false,
    };
  }

  /** @type {Array<{ title: string, status: string, filmId?: string | null, existingFilmId?: string | null, error?: string | null, catalogReady?: boolean, rankingReady?: boolean }>} */
  const results = [];
  /** @type {string[]} */
  const successfulFilmIds = [];
  let enqueueCallCount = 0;

  for (const entry of classified) {
    const title = entry.item.input.title;
    if (entry.duplicate) {
      results.push({
        title,
        status: FILM_STATUS.DUPLICATE_SKIPPED,
        existingFilmId: entry.duplicate.existingFilmId,
        filmId: null,
        error: null,
      });
      console.log(
        `[duplicate_skipped] ${title} — existing UUID ${entry.duplicate.existingFilmId}`
      );
      continue;
    }

    let createdFilmId = null;
    try {
      createdFilmId = await importOneFilm(supabase, entry.item);
      console.log(`[imported] ${title} — ${createdFilmId}`);

      const pipelineResult = await pipeline({
        supabase,
        options: {
          ...options,
          file: null,
          filmIds: [createdFilmId],
          deferEnqueue: true,
        },
      });

      const state = pipelineResult?.states?.get(createdFilmId);
      if (!state?.rankingReady) {
        throw new Error("Film did not become ranking-ready");
      }
      if (!options.skipMedia && !state?.catalogReady) {
        const film =
          pipelineResult?.films?.find((row) => row.id === createdFilmId) ?? {
            id: createdFilmId,
            title,
          };
        throw new Error(describeMissingStoragePoster(film));
      }

      const status = state.catalogReady
        ? FILM_STATUS.CATALOG_READY
        : FILM_STATUS.RANKING_READY;
      results.push({
        title,
        status,
        filmId: createdFilmId,
        rankingReady: true,
        catalogReady: Boolean(state.catalogReady),
        error: null,
      });
      successfulFilmIds.push(createdFilmId);
      console.log(`[${status}] ${title} — ${createdFilmId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (createdFilmId) {
        await rollbackCreatedFilm(supabase, createdFilmId);
      }
      results.push({
        title,
        status: FILM_STATUS.FAILED_ROLLED_BACK,
        filmId: createdFilmId,
        error: message,
      });
      console.error(`[failed_rolled_back] ${title} — ${message}`);
    }
  }

  /** @type {unknown[]} */
  let jobs = [];
  if (successfulFilmIds.length > 0) {
    enqueueCallCount += 1;
    jobs = await enqueue(supabase, profiles);
    console.log(`Enqueued profiles: ${jobs.length} (once for ${successfulFilmIds.length} successful film(s))`);
    if (options.waitForJobs) {
      await waitForJobs(supabase, jobs, {
        ...options,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
      await verifyCoverage(supabase, profiles, successfulFilmIds);
      console.log("Worker completion and successful-film coverage verified.");
    } else {
      console.log("Check jobs with: select * from profile_score_rebuild_jobs;");
    }
  } else {
    console.log("No ranking-ready films — enqueue skipped.");
  }

  printBatchReport(results);
  const exitCode = resolveBatchExitCode(results);
  return {
    results,
    successfulFilmIds,
    jobs,
    profiles,
    exitCode,
    enqueueCalled: enqueueCallCount > 0,
    enqueueCallCount,
  };
}

export async function processFilmBatch({
  supabase,
  options,
  runScript = runScopedScript,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onEnqueue = () => {},
} = {}) {
  if (!supabase) throw new Error("supabase client is required");
  const { filmIds } = options;
  const deferEnqueue = Boolean(options.deferEnqueue);
  const initial = await loadState(supabase, filmIds);
  const snapshots = new Map(initial.films.map((film) => [film.id, snapshotFilm(film)]));
  const profiles = await readProfiles(supabase);
  const initialStates = new Map(
    initial.films.map((film) => [
      film.id,
      readiness(
        film,
        validEmbedding(initial.moodById.get(film.id)?.embedding),
        validEmbedding(initial.aestheticById.get(film.id)?.embedding)
      ),
    ])
  );

  for (const film of initial.films) {
    logFilm("preflight", film, `ranking=${initialStates.get(film.id).rankingReady ? "ready" : "not-ready"}`);
  }
  const metadataFailures = initial.films.filter(
    (film) => !initialStates.get(film.id).metadata
  );
  if (metadataFailures.length) {
    throw new Error(
      `Metadata readiness failed before OpenAI: ${metadataFailures
        .map((film) => film.title)
        .join(", ")}`
    );
  }

  const allInitiallyReady = initial.films.every(
    (film) => initialStates.get(film.id).rankingReady
  );
  const needsPosterCache =
    !options.skipMedia &&
    initial.films.some((film) => !hasStoragePoster(film));
  if (allInitiallyReady && !needsPosterCache && !options.rebuildAllProfiles) {
    console.log("Fully ranking-ready batch: no-op (use --rebuild-all-profiles to enqueue).");
    printTable(initial.films, initialStates);
    return { noOp: true, profiles, states: initialStates, films: initial.films };
  }

  const missingMoodTags = initial.films.filter((film) => !hasTags(film.moods));
  const missingAestheticTags = initial.films.filter(
    (film) => !hasTags(film.aesthetic_tags)
  );
  console.log(
    `Execution plan: enrichment calls=${missingMoodTags.length + missingAestheticTags.length}, embedding calls=${
      initial.films.filter((film) => !initialStates.get(film.id).moodEmbedding).length +
      initial.films.filter((film) => !initialStates.get(film.id).aestheticEmbedding).length
    }, profiles=${profiles.length}`
  );
  if (options.dryRun) {
    for (const film of initial.films) {
      logFilm("enrichment", film, `${hasTags(film.moods) ? "skip moods" : "would fill moods"}; ${hasTags(film.aesthetic_tags) ? "skip aesthetic tags" : "would fill aesthetic tags"}`);
      logFilm("embeddings", film, `${initialStates.get(film.id).moodEmbedding ? "skip mood" : "would create mood"}; ${initialStates.get(film.id).aestheticEmbedding ? "skip aesthetic" : "would create aesthetic"}`);
      logFilm("media", film, options.skipMedia ? "skipped (--skip-media)" : "would fill images, cache posters, fill trailers");
    }
    console.log(`Profiles that would be enqueued: ${profiles.map((profile) => profile.slug ?? profile.id).join(", ")}`);
    printTable(initial.films, initialStates);
    return { dryRun: true, profiles, states: initialStates, films: initial.films };
  }

  try {
    if (missingMoodTags.length || missingAestheticTags.length) {
      if (missingMoodTags.length) {
        await runScript(
          "fill-emotional-tags.mjs",
          missingMoodTags.map((film) => film.id),
          false
        );
      }
      if (missingAestheticTags.length) {
        await runScript(
          "fill-aesthetic-tags.mjs",
          missingAestheticTags.map((film) => film.id),
          false
        );
      }
    }
    let current = await loadState(supabase, filmIds);
    for (const film of current.films) logFilm("enrichment", film, hasTags(film.moods) && hasTags(film.aesthetic_tags) ? "complete" : "incomplete");
    if (current.films.some((film) => !hasTags(film.moods) || !hasTags(film.aesthetic_tags))) {
      throw new Error("Enrichment did not make every film ranking-ready for tags");
    }
    const filmsMissingMoodEmbeddings = current.films.filter(
      (film) => !validEmbedding(current.moodById.get(film.id)?.embedding)
    );
    const filmsMissingAestheticEmbeddings = current.films.filter(
      (film) => !validEmbedding(current.aestheticById.get(film.id)?.embedding)
    );
    if (filmsMissingMoodEmbeddings.length) {
      await runScript(
        "fill-film-mood-embeddings.mjs",
        filmsMissingMoodEmbeddings.map((film) => film.id),
        false
      );
    }
    if (filmsMissingAestheticEmbeddings.length) {
      await runScript(
        "fill-film-aesthetic-embeddings.mjs",
        filmsMissingAestheticEmbeddings.map((film) => film.id),
        false
      );
    }
    current = await loadState(supabase, filmIds);
    const states = new Map(
      current.films.map((film) => [
        film.id,
        readiness(
          film,
          validEmbedding(current.moodById.get(film.id)?.embedding),
          validEmbedding(current.aestheticById.get(film.id)?.embedding)
        ),
      ])
    );
    for (const film of current.films) logFilm("embeddings", film, states.get(film.id).moodEmbedding && states.get(film.id).aestheticEmbedding ? "valid" : "invalid");
    if (options.skipMedia) {
      for (const film of current.films) logFilm("media", film, "skipped (--skip-media)");
    } else {
      const filmsMissingImages = current.films.filter(
        (film) => !nonEmpty(film.poster_url) && !nonEmpty(film.image_url)
      );
      const filmsMissingTrailers = current.films.filter(
        (film) => !nonEmpty(film.trailer_url)
      );
      if (filmsMissingImages.length) {
        await runScript(
          "fill-images.mjs",
          filmsMissingImages.map((film) => film.id),
          false
        );
      }

      // Always attempt caching for the batch; cache-posters skips rows that
      // already have poster_url (unless --force, which this path never passes).
      try {
        await runScript("cache-posters.mjs", filmIds, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`cache-posters reported failures: ${message}`);
      }

      if (filmsMissingTrailers.length) {
        await runScript(
          "fill-trailers.mjs",
          filmsMissingTrailers.map((film) => film.id),
          false
        );
      }
      current = await loadState(supabase, filmIds);
      assertStoragePosters(current.films);
      for (const film of current.films) {
        logFilm(
          "media",
          film,
          `image=${hasStoragePoster(film) ? "storage" : "missing"}; video=${nonEmpty(film.trailer_url) ? "available" : "missing"}`
        );
      }
    }
    const finalStates = new Map(
      current.films.map((film) => [
        film.id,
        readiness(
          film,
          validEmbedding(current.moodById.get(film.id)?.embedding),
          validEmbedding(current.aestheticById.get(film.id)?.embedding)
        ),
      ])
    );
    printTable(current.films, finalStates);
    const notReady = current.films.filter((film) => !finalStates.get(film.id).rankingReady);
    if (notReady.length) throw new Error(`Ranking readiness failed: ${notReady.map((film) => film.title).join(", ")}`);
    if (!options.skipMedia) {
      assertStoragePosters(current.films);
    }
    const immutableAfter = await loadState(supabase, filmIds);
    for (const film of immutableAfter.films) {
      if (immutableFieldsChanged(snapshots.get(film.id), film)) {
        throw new Error(`Immutable film fields changed: ${film.title}`);
      }
    }
    if (stableValue(initial.recognitions) !== stableValue(immutableAfter.recognitions)) {
      throw new Error("Festival recognitions changed unexpectedly");
    }

    for (const film of current.films) {
      logFilm("ranking-ready", film, "yes");
      logFilm("catalog-ready", film, finalStates.get(film.id).catalogReady ? "yes" : "no");
    }

    if (deferEnqueue) {
      return { deferredEnqueue: true, states: finalStates, films: current.films, profiles };
    }

    onEnqueue();
    const jobs = await enqueueProfiles(supabase, profiles);
    console.log(`Enqueued profiles: ${jobs.length}`);
    if (options.waitForJobs) {
      await waitForJobs(supabase, jobs, { ...options, sleep });
      await verifyCoverage(supabase, profiles, filmIds);
      console.log("Worker completion and profile × film coverage verified.");
    } else {
      console.log("Check jobs with: select * from profile_score_rebuild_jobs;");
    }
    return { jobs, states: finalStates, profiles, films: current.films };
  } catch (error) {
    console.error("Batch stopped before enqueue:", error.message);
    throw error;
  }
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key);

  if (options.file) {
    const validation = await validateFile(options.file);
    for (const message of validation.warningMessages ?? []) {
      console.warn(message);
    }
    if (validation.errors.length) {
      throw new Error(
        `Invalid film import batch:\n${validation.messages
          .map((message) => `- ${message}`)
          .join("\n")}`
      );
    }

    const result = await processFilmImportBatch({
      supabase,
      batch: validation.data,
      options,
    });
    process.exitCode = result.exitCode ?? EXIT.SUCCESS;
    return;
  }

  if (options.dryRun) {
    console.log(`Dry-run embedding config: model=${EMBEDDING_MODEL}, dimensions=${EMBEDDING_DIMENSIONS ?? "provider response"}`);
  }
  await processFilmBatch({ supabase, options });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`process-film-batch failed: ${error.message}`);
    process.exitCode = EXIT.FATAL;
  });
}

export {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  parseArgs,
  buildFilmIdentity,
  buildFilmInsertPayload,
  buildRecognitionInsertPayload,
  buildImportPlan,
  parseTmdbId,
  executeImportPlan,
  rollbackImportedRows,
  rollbackCreatedFilm,
  classifyImportPlan,
  readiness,
  validEmbedding,
  buildVideoLanguageList,
};
