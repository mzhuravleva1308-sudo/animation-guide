import assert from "node:assert/strict";
import test from "node:test";
import {
  PIPELINE_STATUS,
  QUEUE_STATUS,
  RUN_EXIT,
  WEEKLY_IMPORT_DEFAULTS,
  applyQueueResult,
  buildManualRetryUpdate,
  buildRunReport,
  claimQueueItemsInMemory,
  countRetryableFailedFromRows,
  formatWeeklyImportEmail,
  formatWeeklyImportEmailSubject,
  isLowFilmQueue,
  mapPipelineResultToQueueUpdate,
  processClaimedQueueItem,
  resolveWeeklyImportExitCode,
  runWeeklyFilmImport,
  sanitizePublicMessage,
  selectClaimableQueueItems,
} from "./film-import-queue.mjs";
import { sendWeeklyFilmImportEmail } from "./send-weekly-film-import-email.mjs";

function makeItem(overrides = {}) {
  return {
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
    title: overrides.title ?? "Film A",
    year: overrides.year ?? 2026,
    payload: overrides.payload ?? { title: overrides.title ?? "Film A" },
    status: overrides.status ?? QUEUE_STATUS.PENDING,
    attempts: overrides.attempts ?? 0,
    max_attempts: overrides.max_attempts ?? 3,
    sort_order: overrides.sort_order ?? 1,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    locked_at: overrides.locked_at ?? null,
    started_at: overrides.started_at ?? null,
    finished_at: overrides.finished_at ?? null,
    result_status: overrides.result_status ?? null,
    result_message: overrides.result_message ?? null,
    film_id: overrides.film_id ?? null,
  };
}

/**
 * Minimal supabase stub for runWeeklyFilmImport tests.
 */
function makeSupabaseStub(state = {}) {
  const updates = state.updates ?? [];
  let pendingReads = 0;
  return {
    updates,
    rpc: async (name, args) => {
      if (name === "claim_film_import_queue_items") {
        if (state.claimError) return { data: null, error: state.claimError };
        const items = state.claimItems ?? [];
        const limit = args?.requested_limit ?? items.length;
        return { data: items.slice(0, limit), error: null };
      }
      if (name === "count_pending_film_import_queue_items") {
        pendingReads += 1;
        if (pendingReads === 1 && state.pendingBefore != null) {
          return { data: state.pendingBefore, error: null };
        }
        return {
          data: state.remainingPending ?? state.pendingBefore ?? 0,
          error: null,
        };
      }
      return { data: null, error: new Error(`unexpected rpc ${name}`) };
    },
    from() {
      return {
        select() {
          return {
            eq(_field, value) {
              const failedRows =
                value === QUEUE_STATUS.FAILED
                  ? state.retryableFailedRows ?? []
                  : [];
              const result = Promise.resolve({
                data: failedRows,
                error: null,
              });
              // Used by failExhaustedStaleProcessingItems (.eq().lt()).
              result.lt = async () => ({ data: [], error: null });
              return result;
            },
          };
        },
        update(payload) {
          return {
            eq(field, value) {
              updates.push({ field, value, payload });
              return {
                eq() {
                  return { error: null };
                },
              };
            },
          };
        },
        order() {
          return {
            order() {
              return {
                limit: async () => ({
                  data: state.claimItems ?? [],
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

test("selectClaimableQueueItems returns only pending rows", () => {
  const items = [
    makeItem({ id: "a", status: QUEUE_STATUS.PENDING, sort_order: 2 }),
    makeItem({ id: "b", status: QUEUE_STATUS.COMPLETED, sort_order: 1 }),
    makeItem({ id: "c", status: QUEUE_STATUS.FAILED, sort_order: 0 }),
    makeItem({ id: "d", status: QUEUE_STATUS.PENDING, sort_order: 1 }),
  ];
  const selected = selectClaimableQueueItems(items, { limit: 10 });
  assert.deepEqual(
    selected.map((row) => row.id),
    ["d", "a"]
  );
});

test("selectClaimableQueueItems respects batch limit", () => {
  const items = [
    makeItem({ id: "1", sort_order: 1 }),
    makeItem({ id: "2", sort_order: 2 }),
    makeItem({ id: "3", sort_order: 3 }),
  ];
  const selected = selectClaimableQueueItems(items, { limit: 2 });
  assert.equal(selected.length, 2);
  assert.deepEqual(
    selected.map((row) => row.id),
    ["1", "2"]
  );
});

test("completed films are never selected again", () => {
  const items = [
    makeItem({
      id: "done",
      status: QUEUE_STATUS.COMPLETED,
      sort_order: 1,
    }),
    makeItem({
      id: "warn",
      status: QUEUE_STATUS.COMPLETED_WITH_WARNINGS,
      sort_order: 2,
    }),
  ];
  assert.deepEqual(selectClaimableQueueItems(items, { limit: 5 }), []);
});

test("stale processing rows become claimable after timeout", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const items = [
    makeItem({
      id: "stuck",
      status: QUEUE_STATUS.PROCESSING,
      locked_at: "2026-08-04T10:00:00.000Z",
      attempts: 1,
      sort_order: 1,
    }),
    makeItem({
      id: "fresh",
      status: QUEUE_STATUS.PROCESSING,
      locked_at: "2026-08-04T11:50:00.000Z",
      attempts: 1,
      sort_order: 2,
    }),
  ];
  const selected = selectClaimableQueueItems(items, {
    limit: 5,
    now,
    staleAfterMinutes: 90,
  });
  assert.deepEqual(
    selected.map((row) => row.id),
    ["stuck"]
  );
});

test("exhausted attempts are not reclaimed", () => {
  const items = [
    makeItem({
      id: "exhausted",
      status: QUEUE_STATUS.PENDING,
      attempts: 3,
      max_attempts: 3,
    }),
  ];
  assert.deepEqual(selectClaimableQueueItems(items, { limit: 5 }), []);
});

test("mapPipelineResultToQueueUpdate maps success and failure", () => {
  assert.deepEqual(
    mapPipelineResultToQueueUpdate({
      status: PIPELINE_STATUS.CATALOG_READY,
      filmId: "film-1",
    }),
    {
      status: QUEUE_STATUS.COMPLETED,
      result_status: PIPELINE_STATUS.CATALOG_READY,
      result_message: "Imported and catalog-ready",
      film_id: "film-1",
    }
  );

  const failed = mapPipelineResultToQueueUpdate({
    status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
    error: "Poster missing",
  });
  assert.equal(failed.status, QUEUE_STATUS.FAILED);
  assert.equal(failed.result_message, "Poster missing");
  assert.equal(failed.film_id, null);

  const warning = mapPipelineResultToQueueUpdate({
    status: PIPELINE_STATUS.DUPLICATE_SKIPPED,
    existingFilmId: "existing-1",
  });
  assert.equal(warning.status, QUEUE_STATUS.COMPLETED_WITH_WARNINGS);
  assert.equal(warning.film_id, "existing-1");
});

test("applyQueueResult persists success and failure onto the row", () => {
  const pending = makeItem({ status: QUEUE_STATUS.PROCESSING, attempts: 1 });
  const ok = applyQueueResult(pending, {
    status: PIPELINE_STATUS.RANKING_READY,
    filmId: "film-ok",
  });
  assert.equal(ok.status, QUEUE_STATUS.COMPLETED);
  assert.equal(ok.film_id, "film-ok");
  assert.ok(ok.finished_at);

  const bad = applyQueueResult(pending, {
    status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
    error: "boom",
  });
  assert.equal(bad.status, QUEUE_STATUS.FAILED);
  assert.equal(bad.result_message, "boom");
});

test("batch continues after one film fails", async () => {
  const items = [
    makeItem({ id: "ok-1", title: "Good Film", sort_order: 1 }),
    makeItem({ id: "bad-1", title: "Bad Film", sort_order: 2 }),
  ];
  const updates = [];
  const supabase = makeSupabaseStub({
    claimItems: items,
    pendingBefore: 2,
    remainingPending: 0,
    retryableFailedRows: [
      makeItem({
        id: "bad-1",
        status: QUEUE_STATUS.FAILED,
        attempts: 1,
        max_attempts: 3,
      }),
    ],
    updates,
  });

  const processFilmImportBatch = async ({ batch }) => {
    const title = batch.films[0].title;
    if (title === "Bad Film") {
      return {
        results: [
          {
            title,
            status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
            error: "enrichment failed",
          },
        ],
      };
    }
    return {
      results: [
        {
          title,
          status: PIPELINE_STATUS.CATALOG_READY,
          filmId: "created-1",
        },
      ],
    };
  };

  const emails = [];
  const outcome = await runWeeklyFilmImport({
    supabase,
    processFilmImportBatch,
    sendEmail: async (report) => {
      emails.push(report);
    },
    options: { batchSize: 2 },
  });

  assert.equal(outcome.report.successCount, 1);
  assert.equal(outcome.report.failedCount, 1);
  assert.equal(outcome.report.runStatus, "partial");
  assert.equal(outcome.exitCode, RUN_EXIT.PARTIAL);
  assert.equal(emails.length, 1);
  assert.equal(updates.length, 2);
  assert.equal(outcome.report.retryableFailed, 1);
});

test("empty queue still builds a report and can send email", async () => {
  const supabase = makeSupabaseStub({
    claimItems: [],
    pendingBefore: 0,
    remainingPending: 0,
  });
  const emails = [];
  const outcome = await runWeeklyFilmImport({
    supabase,
    processFilmImportBatch: async () => {
      throw new Error("should not run");
    },
    sendEmail: async (report) => {
      emails.push(report);
    },
    options: { batchSize: 5 },
  });
  assert.equal(outcome.report.runStatus, "empty_queue");
  assert.equal(outcome.exitCode, RUN_EXIT.SUCCESS);
  assert.equal(emails[0].claimedCount, 0);
  assert.equal(emails[0].lowQueue, true);
  assert.equal(
    formatWeeklyImportEmailSubject(emails[0]),
    "⚠️ Resonale weekly import — queue is empty"
  );
});

test("buildRunReport and email formatting cover run metadata", () => {
  const report = buildRunReport({
    startedAt: "2026-08-04T10:00:00.000Z",
    finishedAt: "2026-08-04T10:05:00.000Z",
    claimed: [{ title: "A" }, { title: "B" }],
    filmResults: [
      {
        title: "A",
        queueStatus: QUEUE_STATUS.COMPLETED,
        resultMessage: "ok",
      },
      {
        title: "B",
        queueStatus: QUEUE_STATUS.FAILED,
        resultMessage: "poster missing",
      },
    ],
    pendingBefore: 10,
    remainingPending: 8,
    retryableFailed: 1,
    runUrl: "https://github.com/example/repo/actions/runs/1",
  });
  assert.equal(report.runStatus, "partial");
  assert.equal(report.durationMs, 5 * 60_000);
  assert.equal(report.lowQueue, false);
  assert.equal(resolveWeeklyImportExitCode(report), RUN_EXIT.PARTIAL);

  const email = formatWeeklyImportEmail(report);
  assert.equal(
    email.subject,
    "Resonale weekly import — 1 added, 8 remaining"
  );
  assert.match(email.text, /Successfully added/);
  assert.match(email.text, /- A/);
  assert.match(email.text, /Failed:/);
  assert.match(email.text, /poster missing/);
  assert.match(email.text, /Remaining pending: 8/);
  assert.match(email.text, /Retryable failed \(manual retry\): 1/);
  assert.match(email.text, /GitHub Actions run/);
  assert.doesNotMatch(email.text, /sk-/);
  assert.doesNotMatch(email.text, /Low film queue/);
});

test("remaining 7 pending does not trigger low-queue warning", () => {
  const report = buildRunReport({
    startedAt: "2026-08-04T10:00:00.000Z",
    finishedAt: "2026-08-04T10:01:00.000Z",
    claimed: [{ title: "A" }],
    filmResults: [
      {
        title: "A",
        queueStatus: QUEUE_STATUS.COMPLETED,
        resultMessage: "ok",
      },
    ],
    pendingBefore: 12,
    remainingPending: 7,
    retryableFailed: 0,
  });
  assert.equal(isLowFilmQueue(7), false);
  assert.equal(report.lowQueue, false);
  assert.equal(report.lowQueueWarning, null);
  assert.equal(
    formatWeeklyImportEmailSubject(report),
    "Resonale weekly import — 1 added, 7 remaining"
  );
});

test("remaining 6 pending triggers low-queue warning", () => {
  const report = buildRunReport({
    startedAt: "2026-08-04T10:00:00.000Z",
    finishedAt: "2026-08-04T10:01:00.000Z",
    claimed: Array.from({ length: 5 }, (_, i) => ({ title: `F${i}` })),
    filmResults: Array.from({ length: 5 }, (_, i) => ({
      title: `F${i}`,
      queueStatus: QUEUE_STATUS.COMPLETED,
      resultMessage: "ok",
    })),
    pendingBefore: 11,
    remainingPending: 6,
    retryableFailed: 2,
  });
  assert.equal(report.lowQueue, true);
  assert.match(report.lowQueueWarning, /only 6 films remaining/);
  const email = formatWeeklyImportEmail(report);
  assert.equal(
    email.subject,
    "⚠️ Resonale weekly import — 5 added, only 6 remaining"
  );
  assert.match(email.text, /Low film queue: only 6 films remaining/);
  assert.match(email.text, /Please prepare and enqueue a new batch/);
  assert.match(email.text, /Pending before run: 11/);
  assert.match(email.text, /Retryable failed \(manual retry\): 2/);
});

test("empty queue email subject and low-queue warning", () => {
  const report = buildRunReport({
    startedAt: "2026-08-04T10:00:00.000Z",
    finishedAt: "2026-08-04T10:01:00.000Z",
    claimed: [],
    filmResults: [],
    pendingBefore: 0,
    remainingPending: 0,
    retryableFailed: 0,
  });
  assert.equal(report.runStatus, "empty_queue");
  assert.equal(report.lowQueue, true);
  const email = formatWeeklyImportEmail(report);
  assert.equal(email.subject, "⚠️ Resonale weekly import — queue is empty");
  assert.match(email.text, /Low film queue: only 0 films remaining/);
});

test("run with fewer than 5 pending before start still reports correctly", async () => {
  const items = [
    makeItem({ id: "a", title: "Only A", sort_order: 1 }),
    makeItem({ id: "b", title: "Only B", sort_order: 2 }),
  ];
  const supabase = makeSupabaseStub({
    claimItems: items,
    pendingBefore: 2,
    remainingPending: 0,
  });
  const outcome = await runWeeklyFilmImport({
    supabase,
    processFilmImportBatch: async ({ batch }) => ({
      results: [
        {
          title: batch.films[0].title,
          status: PIPELINE_STATUS.CATALOG_READY,
          filmId: "f",
        },
      ],
    }),
    sendEmail: async () => {},
    options: { batchSize: 5 },
  });
  assert.equal(outcome.report.pendingBefore, 2);
  assert.equal(outcome.report.claimedCount, 2);
  assert.equal(outcome.report.successCount, 2);
  assert.equal(outcome.report.remainingPending, 0);
  assert.equal(outcome.report.lowQueue, true);
  assert.equal(
    formatWeeklyImportEmailSubject(outcome.report),
    "⚠️ Resonale weekly import — queue is empty"
  );
});

test("partial failures keep remaining pending accurate and separate retryable failed", async () => {
  const items = [
    makeItem({ id: "ok", title: "Good", sort_order: 1 }),
    makeItem({ id: "bad", title: "Bad", sort_order: 2 }),
  ];
  const supabase = makeSupabaseStub({
    claimItems: items,
    pendingBefore: 8,
    remainingPending: 6,
    retryableFailedRows: [
      makeItem({
        id: "bad",
        status: QUEUE_STATUS.FAILED,
        attempts: 1,
        max_attempts: 3,
      }),
      makeItem({
        id: "old",
        status: QUEUE_STATUS.FAILED,
        attempts: 3,
        max_attempts: 3,
      }),
    ],
  });

  const outcome = await runWeeklyFilmImport({
    supabase,
    processFilmImportBatch: async ({ batch }) => {
      if (batch.films[0].title === "Bad") {
        return {
          results: [
            {
              title: "Bad",
              status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
              error: "no poster",
            },
          ],
        };
      }
      return {
        results: [
          {
            title: "Good",
            status: PIPELINE_STATUS.CATALOG_READY,
            filmId: "g",
          },
        ],
      };
    },
    sendEmail: async () => {},
    options: { batchSize: 5 },
  });

  assert.equal(outcome.report.pendingBefore, 8);
  assert.equal(outcome.report.claimedCount, 2);
  assert.equal(outcome.report.successCount, 1);
  assert.equal(outcome.report.failedCount, 1);
  assert.equal(outcome.report.remainingPending, 6);
  assert.equal(outcome.report.retryableFailed, 1);
  assert.equal(outcome.report.lowQueue, true);
});

test("countRetryableFailedFromRows ignores exhausted failures", () => {
  assert.equal(
    countRetryableFailedFromRows([
      makeItem({ status: QUEUE_STATUS.FAILED, attempts: 1, max_attempts: 3 }),
      makeItem({ status: QUEUE_STATUS.FAILED, attempts: 3, max_attempts: 3 }),
      makeItem({ status: QUEUE_STATUS.PENDING, attempts: 0, max_attempts: 3 }),
    ]),
    1
  );
});

test("parallel claim skips a row held by another claimer", () => {
  const item = makeItem({ id: "shared", sort_order: 1 });
  const store = { items: [item], locks: new Set(["shared"]) };
  const claimed = claimQueueItemsInMemory(store, { limit: 1 });
  assert.equal(claimed.length, 0);
  assert.equal(item.status, QUEUE_STATUS.PENDING);
});

test("second claim after success does not reprocess completed film", () => {
  const store = {
    items: [makeItem({ id: "once", sort_order: 1 })],
    locks: new Set(),
  };
  const first = claimQueueItemsInMemory(store, { limit: 1 });
  assert.equal(first.length, 1);
  Object.assign(
    store.items[0],
    applyQueueResult(store.items[0], {
      status: PIPELINE_STATUS.CATALOG_READY,
      filmId: "film-1",
    })
  );
  const second = claimQueueItemsInMemory(store, { limit: 1 });
  assert.equal(second.length, 0);
});

test("retry after system crash reclaims stale processing row", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const store = {
    items: [
      makeItem({
        id: "crash",
        status: QUEUE_STATUS.PROCESSING,
        attempts: 1,
        locked_at: "2026-08-04T10:00:00.000Z",
        sort_order: 1,
      }),
    ],
    locks: new Set(),
  };
  const claimed = claimQueueItemsInMemory(store, {
    limit: 1,
    now,
    staleAfterMinutes: 90,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].attempts, 2);
  assert.equal(store.items[0].status, QUEUE_STATUS.PROCESSING);
});

test("system error on claim is reported without pretending films failed", async () => {
  const supabase = makeSupabaseStub({
    claimError: new Error("db unavailable"),
    pendingBefore: 7,
    remainingPending: 7,
  });
  const emails = [];
  const outcome = await runWeeklyFilmImport({
    supabase,
    processFilmImportBatch: async () => {
      throw new Error("should not run");
    },
    sendEmail: async (report) => emails.push(report),
  });
  assert.equal(outcome.report.runStatus, "system_error");
  assert.equal(outcome.exitCode, RUN_EXIT.FATAL);
  assert.equal(outcome.report.failedCount, 0);
  assert.equal(outcome.report.remainingPending, 7);
  assert.match(emails[0].systemError, /db unavailable/);
});

test("processClaimedQueueItem isolates one film payload for the pipeline", async () => {
  const calls = [];
  const item = makeItem({
    id: "q-1",
    title: "Solo",
    payload: { title: "Solo", year: 2026 },
  });
  const result = await processClaimedQueueItem({
    item,
    supabase: {},
    processFilmImportBatch: async (args) => {
      calls.push(args);
      return {
        results: [
          {
            title: "Solo",
            status: PIPELINE_STATUS.CATALOG_READY,
            filmId: "f-1",
          },
        ],
      };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].batch.films.length, 1);
  assert.equal(calls[0].batch.films[0].title, "Solo");
  assert.equal(result.queueUpdate.status, QUEUE_STATUS.COMPLETED);
});

test("sanitizePublicMessage redacts secrets and truncates", () => {
  const message = sanitizePublicMessage(
    `Bearer sk-abc123xyz failed\nstack line two`
  );
  assert.doesNotMatch(message, /sk-abc/);
  assert.match(message, /\[redacted\]/);
  assert.doesNotMatch(message, /stack line/);
});

test("buildManualRetryUpdate only allows failed/warning rows", () => {
  const failed = makeItem({ status: QUEUE_STATUS.FAILED, attempts: 2 });
  const update = buildManualRetryUpdate(failed);
  assert.equal(update.status, QUEUE_STATUS.PENDING);
  assert.equal(update.film_id, null);

  assert.throws(
    () =>
      buildManualRetryUpdate(
        makeItem({ status: QUEUE_STATUS.COMPLETED })
      ),
    /Only failed or warning/
  );
});

test("default batch size and low-queue threshold", () => {
  assert.equal(WEEKLY_IMPORT_DEFAULTS.batchSize, 5);
  assert.equal(WEEKLY_IMPORT_DEFAULTS.lowQueueThreshold, 7);
});

test("sendWeeklyFilmImportEmail uses Resend without leaking the API key", async () => {
  const calls = [];
  await sendWeeklyFilmImportEmail(
    buildRunReport({
      startedAt: "2026-08-04T10:00:00.000Z",
      finishedAt: "2026-08-04T10:01:00.000Z",
      claimed: [],
      filmResults: [],
      pendingBefore: 0,
      remainingPending: 0,
    }),
    {
      apiKey: "re_test_key",
      to: "owner@example.com",
      from: "Resonale <reports@example.com>",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, text: async () => "" };
      },
    }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.to[0], "owner@example.com");
  assert.equal(body.subject, "⚠️ Resonale weekly import — queue is empty");
  assert.doesNotMatch(body.text, /re_test_key/);
});
