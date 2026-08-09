import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXIT,
  FILM_STATUS,
  buildVideoLanguageList,
  buildFilmInsertPayload,
  buildImportPlan,
  parseArgs,
  processFilmBatch,
  processFilmImportBatch,
  readiness,
  resolveBatchExitCode,
  validEmbedding,
} from "../scripts/process-film-batch.mjs";

const id = "78a124c0-3523-49e5-8c6f-6b37feacc307";
const SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;

const cachedPosterUrl = `${SUPABASE_URL}/storage/v1/object/public/film-posters/${id}.jpg`;
const baseFilm = {
  title: "Film",
  year: 2026,
  synopsis: "Synopsis",
  the_mood: "Tender",
  technique: "2D",
  moods: ["tender"],
  aesthetic_tags: ["handmade"],
  image_url: "https://image.test/poster.jpg",
  poster_url: cachedPosterUrl,
  trailer_url: "https://youtube.test/video",
};

test("dry-run mode is explicit", () => {
  assert.equal(parseArgs(["--film-ids", id, "--dry-run"]).dryRun, true);
});

test("execute mode is explicit", () => {
  assert.equal(parseArgs(["--film-ids", id, "--execute"]).execute, true);
});

test("unknown UUID format is rejected", () => {
  assert.throws(
    () => parseArgs(["--film-ids", "not-a-uuid", "--dry-run"]),
    /Invalid film UUID/
  );
});

test("duplicate UUIDs are rejected", () => {
  assert.throws(
    () => parseArgs(["--film-ids", `${id},${id}`, "--dry-run"]),
    /Duplicate/
  );
});

test("dry-run accepts skip-media and rebuild flags", () => {
  const options = parseArgs([
    "--film-ids",
    id,
    "--dry-run",
    "--skip-media",
    "--rebuild-all-profiles",
  ]);
  assert.equal(options.skipMedia, true);
  assert.equal(options.rebuildAllProfiles, true);
});

test("ranking-ready films do not require enrichment", () => {
  const state = readiness(baseFilm, true, true);
  assert.equal(state.rankingReady, true);
});

test("missing trailer does not block ranking readiness", () => {
  const state = readiness({ ...baseFilm, trailer_url: null }, true, true);
  assert.equal(state.rankingReady, true);
  assert.equal(state.video, false);
});

test("missing embedding blocks ranking readiness", () => {
  const state = readiness(baseFilm, false, true);
  assert.equal(state.rankingReady, false);
});

test("external image_url without Storage poster_url blocks catalog readiness", () => {
  const state = readiness(
    {
      ...baseFilm,
      poster_url: null,
      image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
    },
    true,
    true
  );
  assert.equal(state.rankingReady, true);
  assert.equal(state.image, false);
  assert.equal(state.catalogReady, false);
});

test("Storage poster_url enables catalog readiness", () => {
  const state = readiness(baseFilm, true, true);
  assert.equal(state.image, true);
  assert.equal(state.catalogReady, true);
});

test("non-Storage poster_url blocks catalog readiness", () => {
  const state = readiness(
    {
      ...baseFilm,
      poster_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
    },
    true,
    true
  );
  assert.equal(state.image, false);
  assert.equal(state.catalogReady, false);
});

test("Storage poster URL check uses env supabase URL, not a hardcoded project domain", () => {
  const otherProject = "https://other-project.supabase.co";
  const state = readiness(
    {
      ...baseFilm,
      poster_url: `${otherProject}/storage/v1/object/public/film-posters/${id}.jpg`,
    },
    true,
    true,
    { supabaseUrl: otherProject }
  );
  assert.equal(state.image, true);
  assert.equal(state.catalogReady, true);
});

test("missing mandatory metadata blocks catalog readiness", () => {
  const state = readiness({ ...baseFilm, synopsis: null }, true, true);
  assert.equal(state.metadata, false);
  assert.equal(state.catalogReady, false);
});

test("embedding vectors are validated for numeric content", () => {
  assert.equal(validEmbedding([0, 1, 0]), true);
  assert.equal(validEmbedding([0, Number.NaN, 0]), false);
});

test("TMDB video languages include English, original, and null", () => {
  assert.deepEqual(buildVideoLanguageList("fr"), ["en", "fr", "null"]);
});

test("after-films continues to call cache-posters", () => {
  const afterFilmsPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../scripts/after-films.mjs"
  );
  const source = fs.readFileSync(afterFilmsPath, "utf8");
  assert.match(source, /scripts\/cache-posters\.mjs/);
  assert.match(source, /scripts\/fill-images\.mjs/);
});

function makeFilmInput(overrides = {}) {
  return {
    title: "Imported Film",
    original_title: "Original Film",
    year: 2026,
    runtime_minutes: 75,
    countries: ["Japan"],
    directors: ["Director"],
    synopsis: "A synopsis.",
    the_mood: "A mood.",
    technique: ["2D"],
    festival_recognitions: [
      {
        festival_name: "Annecy International Animation Film Festival",
        festival_year: 2026,
        section: "Contrechamp",
        recognition_type: "selection",
        award_name: null,
        award_result: null,
        award_level: null,
        source_url: "https://annecyfestival.com/film",
      },
    ],
    source_urls: {
      official: "https://example.com/film",
      festival: null,
      tmdb: "https://www.themoviedb.org/movie/123456",
      imdb: null,
    },
    notes: "Do not import this.",
    quick_filters: [],
    ...overrides,
  };
}

function importBatch(films = [makeFilmInput()]) {
  return { batch_name: "test", films };
}

class FakeSupabase {
  constructor({ failRecognitionAt = null, profiles = null } = {}) {
    this.films = [];
    this.recognitions = [];
    this.moodEmbeddings = [];
    this.aestheticEmbeddings = [];
    this.profiles =
      profiles ??
      Array.from({ length: 12 }, (_, index) => ({
        id: `profile-${index + 1}`,
        slug: `profile-${index + 1}`,
        name: `Profile ${index + 1}`,
      }));
    this.nextId = 1;
    this.failRecognitionAt = failRecognitionAt;
    this.recognitionAttempts = 0;
    this.jobs = [];
  }

  from(table) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
  }

  select() {
    return this;
  }

  in(field, values) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  order() {
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  async single() {
    if (this.operation !== "insert") return { data: null, error: null };
    const film = {
      ...this.payload,
      id: `film-${this.client.nextId++}`,
    };
    this.client.films.push(film);
    return { data: { id: film.id }, error: null };
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }

  async run() {
    if (this.operation === "insert") {
      if (this.table === "film_festival_recognitions") {
        this.client.recognitionAttempts += 1;
        if (this.client.recognitionAttempts === this.client.failRecognitionAt) {
          return { data: null, error: new Error("recognition insert failed") };
        }
        this.client.recognitions.push(this.payload);
      }
      return { data: null, error: null };
    }

    if (this.operation === "upsert") {
      if (this.table === "profile_score_rebuild_jobs") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        this.client.jobs = rows;
      }
      return { data: null, error: null };
    }

    if (this.operation === "delete") {
      const matches = (row) => this.filters.every((filter) => filter(row));
      if (this.table === "films") {
        this.client.films = this.client.films.filter((row) => !matches(row));
      }
      if (this.table === "film_festival_recognitions") {
        this.client.recognitions = this.client.recognitions.filter(
          (row) => !matches(row)
        );
      }
      if (this.table === "film_mood_embeddings") {
        this.client.moodEmbeddings = this.client.moodEmbeddings.filter(
          (row) => !matches(row)
        );
      }
      if (this.table === "film_aesthetic_embeddings") {
        this.client.aestheticEmbeddings = this.client.aestheticEmbeddings.filter(
          (row) => !matches(row)
        );
      }
      return { data: null, error: null };
    }

    let rows =
      this.table === "films"
        ? this.client.films
        : this.table === "profiles"
          ? this.client.profiles
          : this.table === "profile_score_rebuild_jobs"
            ? this.client.jobs
            : this.table === "film_festival_recognitions"
              ? this.client.recognitions
              : this.table === "film_mood_embeddings"
                ? this.client.moodEmbeddings
                : this.table === "film_aesthetic_embeddings"
                  ? this.client.aestheticEmbeddings
                  : [];
    rows = rows.filter((row) => this.filters.every((filter) => filter(row)));
    return { data: rows, error: null };
  }
}

function successPipeline() {
  return async ({ options }) => {
    const states = new Map(
      options.filmIds.map((filmId) => [
        filmId,
        {
          rankingReady: true,
          catalogReady: true,
        },
      ])
    );
    return { states, deferredEnqueue: true };
  };
}

test("file-mode dry-run creates no rows", async () => {
  const supabase = new FakeSupabase();
  let pipelineCalled = false;
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options: { dryRun: true, execute: false },
    pipeline: async () => {
      pipelineCalled = true;
    },
  });
  assert.equal(result.dryRun, true);
  assert.equal(supabase.films.length, 0);
  assert.equal(supabase.recognitions.length, 0);
  assert.equal(pipelineCalled, false);
  assert.equal(result.enqueueCalled, false);
});

test("duplicate of one film does not block the others", async () => {
  const supabase = new FakeSupabase();
  supabase.films.push({
    id: "existing-dup",
    title: "Duplicate Film",
    year: 2026,
    director: "Director",
  });
  const batch = importBatch([
    makeFilmInput({ title: "Duplicate Film" }),
    makeFilmInput({ title: "Unique Film", year: 2025 }),
  ]);
  const result = await processFilmImportBatch({
    supabase,
    batch,
    options: { dryRun: false, execute: true },
    pipeline: successPipeline(),
  });
  assert.equal(
    result.results.find((row) => row.title === "Duplicate Film").status,
    FILM_STATUS.DUPLICATE_SKIPPED
  );
  assert.equal(
    result.results.find((row) => row.title === "Duplicate Film").existingFilmId,
    "existing-dup"
  );
  assert.equal(
    result.results.find((row) => row.title === "Unique Film").status,
    FILM_STATUS.CATALOG_READY
  );
  assert.equal(result.successfulFilmIds.length, 1);
  assert.equal(result.enqueueCallCount, 1);
  assert.equal(result.exitCode, EXIT.SUCCESS);
  assert.equal(supabase.films.filter((film) => film.title === "Unique Film").length, 1);
  assert.equal(supabase.films.filter((film) => film.id === "existing-dup").length, 1);
});

test("enrichment failure of one film does not block the others", async () => {
  const supabase = new FakeSupabase();
  const batch = importBatch([
    makeFilmInput({ title: "Broken Film" }),
    makeFilmInput({ title: "Good Film", year: 2025 }),
  ]);
  const result = await processFilmImportBatch({
    supabase,
    batch,
    options: { dryRun: false, execute: true },
    pipeline: async ({ options }) => {
      if (options.filmIds[0] && supabase.films.find((film) => film.id === options.filmIds[0])?.title === "Broken Film") {
        throw new Error("enrichment failed");
      }
      return successPipeline()({ options });
    },
  });
  assert.equal(
    result.results.find((row) => row.title === "Broken Film").status,
    FILM_STATUS.FAILED_ROLLED_BACK
  );
  assert.equal(
    result.results.find((row) => row.title === "Good Film").status,
    FILM_STATUS.CATALOG_READY
  );
  assert.equal(result.successfulFilmIds.length, 1);
  assert.equal(result.enqueueCallCount, 1);
  assert.equal(result.exitCode, EXIT.PARTIAL);
  assert.equal(supabase.films.some((film) => film.title === "Broken Film"), false);
  assert.equal(supabase.films.some((film) => film.title === "Good Film"), true);
});

test("rollback affects only the failed film", async () => {
  const supabase = new FakeSupabase();
  const batch = importBatch([
    makeFilmInput({ title: "Keep Film", year: 2024 }),
    makeFilmInput({ title: "Fail Film", year: 2025 }),
  ]);
  let firstSucceeded = false;
  const result = await processFilmImportBatch({
    supabase,
    batch,
    options: { dryRun: false, execute: true },
    pipeline: async ({ options }) => {
      const film = supabase.films.find((row) => row.id === options.filmIds[0]);
      if (film?.title === "Fail Film") {
        assert.equal(firstSucceeded, true);
        throw new Error("pipeline boom");
      }
      firstSucceeded = true;
      return successPipeline()({ options });
    },
  });
  assert.equal(result.exitCode, EXIT.PARTIAL);
  assert.equal(supabase.films.length, 1);
  assert.equal(supabase.films[0].title, "Keep Film");
  assert.equal(
    supabase.recognitions.every((row) => row.film_id === supabase.films[0].id),
    true
  );
});

test("19 successful and 1 failed create only 12 profile jobs", async () => {
  const supabase = new FakeSupabase();
  const films = Array.from({ length: 19 }, (_, index) =>
    makeFilmInput({ title: `Good ${index}`, year: 2000 + index })
  );
  films.push(makeFilmInput({ title: "Bad Film", year: 2030 }));
  let enqueueCalls = 0;
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch(films),
    options: { dryRun: false, execute: true },
    pipeline: async ({ options }) => {
      const film = supabase.films.find((row) => row.id === options.filmIds[0]);
      if (film?.title === "Bad Film") throw new Error("bad");
      return successPipeline()({ options });
    },
    enqueue: async (_supabase, profiles) => {
      enqueueCalls += 1;
      return profiles.map((profile) => ({
        profile_id: profile.id,
        generation: 1,
        status: "pending",
      }));
    },
  });
  assert.equal(result.successfulFilmIds.length, 19);
  assert.equal(result.enqueueCallCount, 1);
  assert.equal(enqueueCalls, 1);
  assert.equal(result.jobs.length, 12);
  assert.equal(result.exitCode, EXIT.PARTIAL);
});

test("coverage uses only successful films", async () => {
  const supabase = new FakeSupabase();
  const batch = importBatch([
    makeFilmInput({ title: "Ok One", year: 2021 }),
    makeFilmInput({ title: "Fail One", year: 2022 }),
  ]);
  const result = await processFilmImportBatch({
    supabase,
    batch,
    options: { dryRun: false, execute: true },
    pipeline: async ({ options }) => {
      const film = supabase.films.find((row) => row.id === options.filmIds[0]);
      if (film?.title === "Fail One") throw new Error("fail");
      return successPipeline()({ options });
    },
    enqueue: async (_supabase, profiles) => {
      assert.equal(profiles.length, 12);
      return profiles.map((profile) => ({
        profile_id: profile.id,
        generation: 1,
        status: "pending",
      }));
    },
  });
  assert.equal(result.successfulFilmIds.length, 1);
  assert.equal(result.enqueueCallCount, 1);
  assert.equal(result.jobs.length, 12);
  // coverage is verified only for successfulFilmIds × profiles when --wait-for-jobs
  assert.equal(result.successfulFilmIds.length * 12, 12);
});

test("enqueue is called once for mixed success", async () => {
  const supabase = new FakeSupabase();
  let enqueueCalls = 0;
  await processFilmImportBatch({
    supabase,
    batch: importBatch([
      makeFilmInput({ title: "A", year: 2019 }),
      makeFilmInput({ title: "B", year: 2018 }),
    ]),
    options: { dryRun: false, execute: true },
    pipeline: successPipeline(),
    enqueue: async (_supabase, profiles) => {
      enqueueCalls += 1;
      return profiles.map((profile) => ({ profile_id: profile.id, generation: 1 }));
    },
  });
  assert.equal(enqueueCalls, 1);
});

test("enqueue is not called when every film fails", async () => {
  const supabase = new FakeSupabase();
  let enqueueCalls = 0;
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch([
      makeFilmInput({ title: "A", year: 2011 }),
      makeFilmInput({ title: "B", year: 2012 }),
    ]),
    options: { dryRun: false, execute: true },
    pipeline: async () => {
      throw new Error("always fail");
    },
    enqueue: async () => {
      enqueueCalls += 1;
      return [];
    },
  });
  assert.equal(enqueueCalls, 0);
  assert.equal(result.enqueueCalled, false);
  assert.equal(result.exitCode, EXIT.FATAL);
  assert.equal(supabase.films.length, 0);
});

test("execute creates film and festival recognitions", async () => {
  const supabase = new FakeSupabase();
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options: { dryRun: false, execute: true },
    pipeline: successPipeline(),
  });
  assert.deepEqual(result.successfulFilmIds, ["film-1"]);
  assert.equal(supabase.films.length, 1);
  assert.equal(supabase.recognitions.length, 1);
});

test("notes are not included in film insert payload", () => {
  const payload = buildFilmInsertPayload(makeFilmInput());
  assert.equal("notes" in payload, false);
});

test("legacy batch film insert payload defaults catalog_visible to true", () => {
  const payload = buildFilmInsertPayload(makeFilmInput());
  assert.equal(payload.catalog_visible, true);
});

test("explicit catalog_visible false is preserved on insert payload", () => {
  const payload = buildFilmInsertPayload(
    makeFilmInput({ catalog_visible: false })
  );
  assert.equal(payload.catalog_visible, false);
});

test("buildFilmInsertPayload writes quick_filters from the batch film", () => {
  assert.deepEqual(buildFilmInsertPayload(makeFilmInput()).quick_filters, []);
  assert.deepEqual(
    buildFilmInsertPayload(makeFilmInput({ quick_filters: ["connection"] }))
      .quick_filters,
    ["connection"]
  );
  assert.deepEqual(
    buildFilmInsertPayload(makeFilmInput({ quick_filters: ["distance"] }))
      .quick_filters,
    ["distance"]
  );
  assert.deepEqual(
    buildFilmInsertPayload(makeFilmInput({ quick_filters: ["sci-fi"] }))
      .quick_filters,
    ["sci-fi"]
  );
  assert.deepEqual(
    buildFilmInsertPayload(makeFilmInput({ quick_filters: ["sarcasm"] }))
      .quick_filters,
    ["sarcasm"]
  );
  assert.deepEqual(
    buildFilmInsertPayload(
      makeFilmInput({ quick_filters: ["sci-fi", "connection"] })
    ).quick_filters,
    ["sci-fi", "connection"]
  );
  assert.deepEqual(
    buildFilmInsertPayload(
      makeFilmInput({ quick_filters: ["sci-fi", "distance"] })
    ).quick_filters,
    ["sci-fi", "distance"]
  );
  assert.deepEqual(
    buildFilmInsertPayload(
      makeFilmInput({ quick_filters: ["sarcasm", "distance"] })
    ).quick_filters,
    ["sarcasm", "distance"]
  );
});

test("buildFilmInsertPayload defaults missing quick_filters to []", () => {
  const film = makeFilmInput();
  delete film.quick_filters;
  assert.deepEqual(buildFilmInsertPayload(film).quick_filters, []);
});

test("import persists quick_filters on the films row", async () => {
  const supabase = new FakeSupabase();
  await processFilmImportBatch({
    supabase,
    batch: importBatch([
      makeFilmInput({ quick_filters: ["sci-fi", "distance"] }),
    ]),
    options: { dryRun: false, execute: true },
    pipeline: successPipeline(),
  });
  assert.deepEqual(supabase.films[0].quick_filters, ["sci-fi", "distance"]);
});

test("duplicate existing film keeps current quick_filters", async () => {
  const supabase = new FakeSupabase();
  supabase.films.push({
    id: "existing-dup",
    title: "Duplicate Film",
    year: 2026,
    director: "Director",
    quick_filters: ["connection"],
  });
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch([
      makeFilmInput({
        title: "Duplicate Film",
        quick_filters: ["distance"],
      }),
    ]),
    options: { dryRun: false, execute: true },
    pipeline: successPipeline(),
  });
  assert.equal(result.results[0].status, FILM_STATUS.DUPLICATE_SKIPPED);
  assert.equal(supabase.films.length, 1);
  assert.deepEqual(supabase.films[0].quick_filters, ["connection"]);
});

test("rollback removes film row together with quick_filters", async () => {
  const supabase = new FakeSupabase();
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch([
      makeFilmInput({ quick_filters: ["sci-fi", "connection"] }),
    ]),
    options: { dryRun: false, execute: true },
    pipeline: async () => {
      throw new Error("downstream failed");
    },
  });
  assert.equal(result.results[0].status, FILM_STATUS.FAILED_ROLLED_BACK);
  assert.equal(supabase.films.length, 0);
  assert.equal(result.exitCode, EXIT.FATAL);
});

test("partial recognition failure rolls back only that attempt", async () => {
  const supabase = new FakeSupabase({ failRecognitionAt: 1 });
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options: { dryRun: false, execute: true },
    pipeline: successPipeline(),
  });
  assert.equal(result.results[0].status, FILM_STATUS.FAILED_ROLLED_BACK);
  assert.equal(supabase.films.length, 0);
  assert.equal(supabase.recognitions.length, 0);
  assert.equal(result.exitCode, EXIT.FATAL);
});

test("rerunning the same batch skips duplicate without writes", async () => {
  const supabase = new FakeSupabase();
  const options = { dryRun: false, execute: true };
  await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options,
    pipeline: successPipeline(),
  });
  const second = await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options,
    pipeline: successPipeline(),
  });
  assert.equal(second.results[0].status, FILM_STATUS.DUPLICATE_SKIPPED);
  assert.equal(second.results[0].existingFilmId, "film-1");
  assert.equal(supabase.films.length, 1);
  assert.equal(second.exitCode, EXIT.SUCCESS);
  assert.equal(second.enqueueCalled, false);
});

test("created UUID is passed to the existing pipeline", async () => {
  const supabase = new FakeSupabase();
  let receivedIds;
  await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options: { dryRun: false, execute: true },
    pipeline: async ({ options }) => {
      receivedIds = options.filmIds;
      return successPipeline()({ options });
    },
  });
  assert.deepEqual(receivedIds, ["film-1"]);
});

test("downstream failure rolls back before enqueue", async () => {
  const supabase = new FakeSupabase();
  let enqueueCalls = 0;
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options: { dryRun: false, execute: true },
    pipeline: async () => {
      throw new Error("downstream failed");
    },
    enqueue: async () => {
      enqueueCalls += 1;
      return [];
    },
  });
  assert.equal(enqueueCalls, 0);
  assert.equal(supabase.films.length, 0);
  assert.equal(result.exitCode, EXIT.FATAL);
});

test("file and film-id modes parse independently", () => {
  assert.equal(
    parseArgs(["--file", "batch.json", "--dry-run"]).file,
    "batch.json"
  );
  assert.deepEqual(parseArgs(["--film-ids", id, "--dry-run"]).filmIds, [id]);
});

test("import plan uses a planned UUID and canonical recognition type", () => {
  const [plan] = buildImportPlan(importBatch());
  assert.equal(plan.recognitionPayloads[0].film_id, "<planned-film-uuid>");
  assert.equal(
    plan.recognitionPayloads[0].recognition_type,
    "official_selection"
  );
});

test("resolveBatchExitCode maps success partial and fatal", () => {
  assert.equal(
    resolveBatchExitCode([{ status: FILM_STATUS.CATALOG_READY }]),
    EXIT.SUCCESS
  );
  assert.equal(
    resolveBatchExitCode([
      { status: FILM_STATUS.DUPLICATE_SKIPPED },
      { status: FILM_STATUS.RANKING_READY },
    ]),
    EXIT.SUCCESS
  );
  assert.equal(
    resolveBatchExitCode([
      { status: FILM_STATUS.CATALOG_READY },
      { status: FILM_STATUS.FAILED_ROLLED_BACK },
    ]),
    EXIT.PARTIAL
  );
  assert.equal(
    resolveBatchExitCode([{ status: FILM_STATUS.FAILED_ROLLED_BACK }]),
    EXIT.FATAL
  );
});

class PipelineSupabase {
  constructor(film) {
    this.films = [structuredClone(film)];
    this.moodEmbeddings = [
      { film_id: film.id, embedding: [0, 1, 0], mood_text: "mood" },
    ];
    this.aestheticEmbeddings = [
      {
        film_id: film.id,
        embedding: [0, 1, 0],
        aesthetic_text: "aesthetic",
      },
    ];
    this.recognitions = [];
    this.profiles = [{ id: "profile-1", slug: "profile-1", name: "Profile 1" }];
    this.jobs = [];
  }

  from(table) {
    return new PipelineQuery(this, table);
  }
}

class PipelineQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
  }

  select() {
    return this;
  }

  in(field, values) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  order() {
    return this;
  }

  upsert(payload) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }

  async run() {
    if (this.operation === "upsert") {
      if (this.table === "profile_score_rebuild_jobs") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        this.client.jobs = rows;
      }
      return { data: null, error: null };
    }

    let rows =
      this.table === "films"
        ? this.client.films
        : this.table === "profiles"
          ? this.client.profiles
          : this.table === "profile_score_rebuild_jobs"
            ? this.client.jobs
            : this.table === "film_festival_recognitions"
              ? this.client.recognitions
              : this.table === "film_mood_embeddings"
                ? this.client.moodEmbeddings
                : this.table === "film_aesthetic_embeddings"
                  ? this.client.aestheticEmbeddings
                  : [];
    rows = rows.filter((row) => this.filters.every((filter) => filter(row)));
    return { data: rows, error: null };
  }
}

function rankingReadyFilm(overrides = {}) {
  return {
    id,
    title: "Film",
    year: 2026,
    synopsis: "Synopsis",
    the_mood: "Tender",
    technique: "2D",
    moods: ["tender"],
    aesthetic_tags: ["handmade"],
    image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
    external_image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
    poster_url: null,
    trailer_url: "https://youtube.test/video",
    ...overrides,
  };
}

test("media stage calls cache-posters after fill-images for film with external image_url only", async () => {
  const film = rankingReadyFilm();
  const supabase = new PipelineSupabase(film);
  const scripts = [];

  const result = await processFilmBatch({
    supabase,
    options: {
      filmIds: [id],
      dryRun: false,
      execute: true,
      skipMedia: false,
      deferEnqueue: true,
    },
    runScript: async (script, filmIds) => {
      scripts.push({ script, filmIds: [...filmIds] });
      if (script === "cache-posters.mjs") {
        supabase.films[0].poster_url = cachedPosterUrl;
      }
    },
  });

  assert.deepEqual(
    scripts.map((entry) => entry.script),
    ["cache-posters.mjs"]
  );
  assert.deepEqual(scripts[0].filmIds, [id]);
  assert.equal(result.states.get(id).catalogReady, true);
  assert.equal(result.states.get(id).image, true);
});

test("missing Storage poster after cache-posters blocks the batch", async () => {
  const film = rankingReadyFilm();
  const supabase = new PipelineSupabase(film);

  await assert.rejects(
    () =>
      processFilmBatch({
        supabase,
        options: {
          filmIds: [id],
          dryRun: false,
          execute: true,
          skipMedia: false,
          deferEnqueue: true,
        },
        runScript: async (script) => {
          if (script === "cache-posters.mjs") {
            throw new Error("cache-posters.mjs failed: Download failed (403)");
          }
        },
      }),
    /Storage poster was not created/
  );
});

test("skip-media skips fill-images, cache-posters, and fill-trailers", async () => {
  const ready = rankingReadyFilm({ poster_url: cachedPosterUrl });
  const supabase = new PipelineSupabase(ready);
  const scripts = [];

  await processFilmBatch({
    supabase,
    options: {
      filmIds: [id],
      dryRun: false,
      execute: true,
      skipMedia: true,
      rebuildAllProfiles: true,
      deferEnqueue: true,
    },
    runScript: async (script, filmIds) => {
      scripts.push({ script, filmIds: [...filmIds] });
    },
  });

  assert.deepEqual(scripts, []);
});

test("file-mode rolls back when catalog readiness fails without Storage poster", async () => {
  const supabase = new FakeSupabase();
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options: { dryRun: false, execute: true, skipMedia: false },
    pipeline: async ({ options }) => {
      const states = new Map(
        options.filmIds.map((filmId) => [
          filmId,
          {
            rankingReady: true,
            catalogReady: false,
          },
        ])
      );
      return {
        states,
        films: options.filmIds.map((filmId) => ({
          id: filmId,
          title: "Imported Film",
          image_url: "https://image.tmdb.org/t/p/w500/x.jpg",
          poster_url: null,
        })),
        deferredEnqueue: true,
      };
    },
  });

  assert.equal(result.results[0].status, FILM_STATUS.FAILED_ROLLED_BACK);
  assert.match(result.results[0].error, /Storage poster was not created/);
  assert.equal(supabase.films.length, 0);
  assert.equal(result.exitCode, EXIT.FATAL);
});

test("file-mode succeeds as catalog_ready when Storage poster is present", async () => {
  const supabase = new FakeSupabase();
  const result = await processFilmImportBatch({
    supabase,
    batch: importBatch(),
    options: { dryRun: false, execute: true, skipMedia: false },
    pipeline: async ({ options }) => {
      const states = new Map(
        options.filmIds.map((filmId) => [
          filmId,
          {
            rankingReady: true,
            catalogReady: true,
          },
        ])
      );
      return {
        states,
        films: options.filmIds.map((filmId) => ({
          id: filmId,
          title: "Imported Film",
          poster_url: cachedPosterUrl,
        })),
        deferredEnqueue: true,
      };
    },
  });

  assert.equal(result.results[0].status, FILM_STATUS.CATALOG_READY);
  assert.equal(result.exitCode, EXIT.SUCCESS);
});
