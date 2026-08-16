import assert from "node:assert/strict";
import test from "node:test";
import {
  ENQUEUE_RESULT,
  buildFilmImportQueueKey,
  buildFilmImportQueueRow,
  createInMemoryQueueStore,
  enqueueFilmImportBatch,
  enqueueFilmIntoMemoryStore,
  enqueueFilmIntoMemoryStoreExclusive,
  formatEnqueueSummary,
  isUniqueViolation,
  summarizeEnqueueResults,
} from "./film-import-enqueue.mjs";
import { QUEUE_STATUS } from "./film-import-queue.mjs";
import { normalizeFilmString } from "./film-duplicate-check.mjs";

function sampleFilm(overrides = {}) {
  return {
    title: overrides.title ?? "Flow",
    original_title: overrides.original_title ?? "Flow",
    year: overrides.year ?? 2024,
    runtime_minutes: 85,
    countries: ["Latvia"],
    directors: ["Gints Zilbalodis"],
    synopsis: "A cat survives a flood.",
    the_mood: "Lyrical and tender.",
    technique: ["3D animation"],
    festival_recognitions: [],
    source_urls: {
      official: null,
      festival: null,
      tmdb:
        overrides.tmdb ??
        "https://www.themoviedb.org/movie/12345-flow",
      imdb: null,
    },
    quick_filters: [],
    notes: null,
    ...overrides,
  };
}

test("queue_key uses the same normalization as film hard-duplicates", () => {
  const film = sampleFilm({ title: "The Flow", year: 2024 });
  assert.equal(
    buildFilmImportQueueKey(film),
    `${normalizeFilmString("The Flow")}:2024`
  );
  assert.equal(buildFilmImportQueueKey(film), "flow:2024");
});

test("re-enqueueing the same JSON does not create a second active row", () => {
  const store = createInMemoryQueueStore();
  const film = sampleFilm();
  const first = enqueueFilmIntoMemoryStore(store, film);
  const second = enqueueFilmIntoMemoryStore(store, film);

  assert.equal(first.status, ENQUEUE_RESULT.ADDED);
  assert.equal(second.status, ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED);
  assert.equal(
    store.rows.filter((row) =>
      ["pending", "processing"].includes(row.status)
    ).length,
    1
  );
});

test("duplicate is skipped while other films are still added", () => {
  const store = createInMemoryQueueStore();
  enqueueFilmIntoMemoryStore(store, sampleFilm({ title: "Flow", year: 2024 }));

  const results = [
    enqueueFilmIntoMemoryStore(store, sampleFilm({ title: "Flow", year: 2024 })),
    enqueueFilmIntoMemoryStore(
      store,
      sampleFilm({
        title: "Robot Dreams",
        year: 2023,
        tmdb: "https://www.themoviedb.org/movie/999-robot",
      })
    ),
  ];

  assert.equal(results[0].status, ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED);
  assert.equal(results[1].status, ENQUEUE_RESULT.ADDED);
  const summary = summarizeEnqueueResults(
    results.map((result, index) => ({
      ...result,
      filmTitle: index === 0 ? "Flow" : "Robot Dreams",
      filmYear: index === 0 ? 2024 : 2023,
    }))
  );
  assert.equal(summary.addedCount, 1);
  assert.equal(summary.skippedCount, 1);
  assert.equal(store.rows.length, 2);
});

test("completed or failed rows do not block a new pending enqueue", () => {
  const store = createInMemoryQueueStore([
    {
      ...buildFilmImportQueueRow(sampleFilm({ title: "Flow", year: 2024 })),
      id: "old-completed",
      status: QUEUE_STATUS.COMPLETED,
    },
    {
      ...buildFilmImportQueueRow(
        sampleFilm({
          title: "Robot Dreams",
          year: 2023,
          tmdb: "https://www.themoviedb.org/movie/999-robot",
        })
      ),
      id: "old-failed",
      status: QUEUE_STATUS.FAILED,
    },
  ]);

  const againFlow = enqueueFilmIntoMemoryStore(
    store,
    sampleFilm({ title: "Flow", year: 2024 })
  );
  const againRobot = enqueueFilmIntoMemoryStore(
    store,
    sampleFilm({
      title: "Robot Dreams",
      year: 2023,
      tmdb: "https://www.themoviedb.org/movie/999-robot",
    })
  );

  assert.equal(againFlow.status, ENQUEUE_RESULT.ADDED);
  assert.equal(againRobot.status, ENQUEUE_RESULT.ADDED);
  assert.equal(
    store.rows.filter((row) => row.status === QUEUE_STATUS.PENDING).length,
    2
  );
});

test("parallel enqueue writers cannot both create an active row", () => {
  const store = createInMemoryQueueStore();
  const film = sampleFilm({ title: "Flow", year: 2024 });

  // Simulate a race: first writer holds the identity locks while second tries.
  const row = buildFilmImportQueueRow(film);
  store.locks = new Set([row.queue_key, `tmdb:${row.tmdb_id}`]);
  const loser = enqueueFilmIntoMemoryStoreExclusive(store, film);
  assert.equal(loser.status, ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED);

  store.locks = new Set();
  const winner = enqueueFilmIntoMemoryStoreExclusive(store, film);
  const second = enqueueFilmIntoMemoryStoreExclusive(store, film);
  assert.equal(winner.status, ENQUEUE_RESULT.ADDED);
  assert.equal(second.status, ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED);
  assert.equal(
    store.rows.filter((row) => row.status === QUEUE_STATUS.PENDING).length,
    1
  );
});

test("enqueue summary output shows added and skipped counts", () => {
  const results = [
    {
      status: ENQUEUE_RESULT.ADDED,
      filmTitle: "Flow",
      filmYear: 2024,
      row: { id: "q1", title: "Flow", year: 2024 },
    },
    {
      status: ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED,
      filmTitle: "Robot Dreams",
      filmYear: 2023,
      existingId: "q0",
      row: { id: "q0", title: "Robot Dreams", year: 2023 },
    },
  ];
  const { summary, text } = formatEnqueueSummary(results, "test-batch");
  assert.equal(summary.addedCount, 1);
  assert.equal(summary.skippedCount, 1);
  assert.match(text, /added=1/);
  assert.match(text, /skipped_already_queued=1/);
  assert.match(text, /\[added\] Flow/);
  assert.match(text, /\[skipped_already_queued\] Robot Dreams/);
});

test("replace-active updates payload on an existing pending row", () => {
  const store = createInMemoryQueueStore();
  const original = sampleFilm({ title: "Flow", synopsis: "Old synopsis." });
  enqueueFilmIntoMemoryStore(store, original);

  const corrected = sampleFilm({
    title: "Flow",
    synopsis: "Corrected synopsis.",
  });
  const replaced = enqueueFilmIntoMemoryStore(store, corrected, {
    replaceActive: true,
  });

  assert.equal(replaced.status, ENQUEUE_RESULT.REPLACED_ACTIVE);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].payload.synopsis, "Corrected synopsis.");
});

test("processing rows also block a second active enqueue", () => {
  const store = createInMemoryQueueStore([
    {
      ...buildFilmImportQueueRow(sampleFilm()),
      id: "busy",
      status: QUEUE_STATUS.PROCESSING,
    },
  ]);
  const result = enqueueFilmIntoMemoryStore(store, sampleFilm());
  assert.equal(result.status, ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED);
  assert.equal(store.rows.length, 1);
});

test("isUniqueViolation detects Postgres unique errors", () => {
  assert.equal(isUniqueViolation({ code: "23505", message: "duplicate" }), true);
  assert.equal(
    isUniqueViolation({
      message: "duplicate key value violates unique constraint film_import_queue_active_queue_key_uidx",
    }),
    true
  );
  assert.equal(isUniqueViolation({ code: "42501", message: "denied" }), false);
});

test("supabase enqueue batch skips active duplicates and adds the rest", async () => {
  const inserted = [];
  const active = [
    {
      id: "active-1",
      title: "Flow",
      year: 2024,
      status: "pending",
      queue_key: "flow:2024",
      tmdb_id: 12345,
    },
  ];

  const supabase = {
    from() {
      return {
        select() {
          return {
            eq(field, value) {
              return {
                in() {
                  return {
                    maybeSingle: async () => {
                      if (field === "queue_key" && value === "flow:2024") {
                        return { data: active[0], error: null };
                      }
                      return { data: null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row) {
          return {
            select() {
              return {
                maybeSingle: async () => {
                  const created = {
                    id: `new-${inserted.length + 1}`,
                    ...row,
                  };
                  inserted.push(created);
                  return { data: created, error: null };
                },
              };
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                in() {
                  return {
                    select() {
                      return {
                        maybeSingle: async () => ({ data: null, error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  // Bypass catalog advisory (would call films table).
  const outcome = await enqueueFilmImportBatch({
    supabase,
    batch: {
      batch_name: "mixed",
      films: [
        sampleFilm({ title: "Flow", year: 2024 }),
        sampleFilm({
          title: "Memoir of a Snail",
          year: 2024,
          tmdb: "https://www.themoviedb.org/movie/777-snail",
        }),
      ],
    },
    options: { skipCatalogAdvisory: true },
  });

  assert.equal(outcome.addedCount, 1);
  assert.equal(outcome.skippedCount, 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].title, "Memoir of a Snail");
  assert.match(outcome.reportText, /added=1/);
  assert.match(outcome.reportText, /skipped_already_queued=1/);
});
