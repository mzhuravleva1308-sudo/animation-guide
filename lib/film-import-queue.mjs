/**
 * Orchestration helpers for the weekly film import queue.
 * Does not change process-film-batch internals — wraps claim → pipeline → result.
 */

import {
  DISCOVERY_RELEASE_STATUS,
  mergeReleaseChecklist,
} from "./discovery-to-import-payload.mjs";

export const QUEUE_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  COMPLETED_WITH_WARNINGS: "completed_with_warnings",
  FAILED: "failed",
};

export const PIPELINE_STATUS = {
  RANKING_READY: "ranking_ready",
  CATALOG_READY: "catalog_ready",
  DUPLICATE_SKIPPED: "duplicate_skipped",
  FAILED_ROLLED_BACK: "failed_rolled_back",
};

export const RUN_EXIT = {
  SUCCESS: 0,
  FATAL: 1,
  PARTIAL: 2,
};

/** Default knobs — override via env / CLI / workflow inputs. */
export const WEEKLY_IMPORT_DEFAULTS = {
  batchSize: 5,
  staleAfterMinutes: 90,
  maxAttempts: 3,
  /** Warn in email when remaining pending is strictly below this. */
  lowQueueThreshold: 7,
};

export const LOW_QUEUE_WARNING_TEMPLATE =
  "Low film queue: only {n} films remaining. Please prepare and enqueue a new batch.";

export function isLowFilmQueue(remainingPending, threshold = WEEKLY_IMPORT_DEFAULTS.lowQueueThreshold) {
  return Number(remainingPending) < Number(threshold);
}

export function formatLowQueueWarning(
  remainingPending,
  threshold = WEEKLY_IMPORT_DEFAULTS.lowQueueThreshold
) {
  if (!isLowFilmQueue(remainingPending, threshold)) return null;
  return LOW_QUEUE_WARNING_TEMPLATE.replace("{n}", String(remainingPending));
}

/**
 * Map one processFilmImportBatch result row onto a queue status update.
 * @param {{ status: string, filmId?: string | null, existingFilmId?: string | null, error?: string | null, title?: string }} pipelineRow
 */
export function mapPipelineResultToQueueUpdate(pipelineRow) {
  const pipelineStatus = pipelineRow?.status ?? null;
  const filmId =
    pipelineRow?.filmId ?? pipelineRow?.existingFilmId ?? null;

  if (
    pipelineStatus === PIPELINE_STATUS.CATALOG_READY ||
    pipelineStatus === PIPELINE_STATUS.RANKING_READY
  ) {
    return {
      status: QUEUE_STATUS.COMPLETED,
      result_status: pipelineStatus,
      result_message:
        pipelineStatus === PIPELINE_STATUS.CATALOG_READY
          ? "Imported and catalog-ready"
          : "Imported and ranking-ready",
      film_id: filmId,
    };
  }

  if (pipelineStatus === PIPELINE_STATUS.DUPLICATE_SKIPPED) {
    return {
      status: QUEUE_STATUS.COMPLETED_WITH_WARNINGS,
      result_status: pipelineStatus,
      result_message: sanitizePublicMessage(
        pipelineRow?.error ||
          `Duplicate of existing film ${pipelineRow?.existingFilmId ?? ""}`.trim()
      ),
      film_id: filmId,
    };
  }

  return {
    status: QUEUE_STATUS.FAILED,
    result_status: pipelineStatus ?? PIPELINE_STATUS.FAILED_ROLLED_BACK,
    result_message: sanitizePublicMessage(
      pipelineRow?.error || "Film import failed"
    ),
    film_id: null,
  };
}

/** Strip secrets / stack traces from messages stored on the queue or emailed. */
export function sanitizePublicMessage(message, maxLength = 280) {
  if (message == null) return null;
  let text = String(message)
    .replace(/\r\n/g, "\n")
    .split("\n")[0]
    .replace(
      /\b(sk-[a-zA-Z0-9_-]+|Bearer\s+\S+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,
      "[redacted]"
    )
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength - 1)}…`;
  }
  return text || null;
}

/**
 * Pure claim selection (mirrors SQL claim eligibility) for unit tests / in-memory store.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ limit: number, now?: Date, staleAfterMinutes?: number }} options
 */
export function selectClaimableQueueItems(items, options) {
  const limit = Math.max(1, Number(options.limit) || 1);
  const now = options.now ?? new Date();
  const staleAfterMinutes =
    options.staleAfterMinutes ?? WEEKLY_IMPORT_DEFAULTS.staleAfterMinutes;
  const staleBefore = new Date(
    now.getTime() - Math.max(1, staleAfterMinutes) * 60_000
  );

  const eligible = items
    .filter((item) => {
      const attempts = Number(item.attempts) || 0;
      const maxAttempts =
        Number(item.max_attempts) || WEEKLY_IMPORT_DEFAULTS.maxAttempts;
      if (attempts >= maxAttempts) return false;
      if (item.status === QUEUE_STATUS.PENDING) return true;
      if (item.status === QUEUE_STATUS.PROCESSING) {
        const lockedAt = item.locked_at ? new Date(item.locked_at) : null;
        return lockedAt != null && lockedAt < staleBefore;
      }
      return false;
    })
    .sort((a, b) => {
      const order = Number(a.sort_order) - Number(b.sort_order);
      if (order !== 0) return order;
      const created =
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime();
      if (created !== 0) return created;
      return String(a.id).localeCompare(String(b.id));
    });

  return eligible.slice(0, limit);
}

/**
 * In-memory exclusive claim used by tests (SKIP LOCKED analogue).
 * Mutates store items that are successfully claimed.
 * Concurrent claimers that hold `store.locks` for an id are skipped.
 */
export function claimQueueItemsInMemory(store, options) {
  const selected = selectClaimableQueueItems(store.items, options);
  const now = options.now ?? new Date();
  const claimed = [];

  for (const candidate of selected) {
    const item = store.items.find((row) => row.id === candidate.id);
    if (!item) continue;
    if (store.locks.has(item.id)) continue;

    store.locks.add(item.id);
    try {
      // Re-check eligibility under the lock (another claimer may have won).
      const stillEligible = selectClaimableQueueItems([item], {
        ...options,
        limit: 1,
        now,
      });
      if (!stillEligible.length) continue;

      item.status = QUEUE_STATUS.PROCESSING;
      item.attempts = (Number(item.attempts) || 0) + 1;
      item.started_at = item.started_at ?? now.toISOString();
      item.locked_at = now.toISOString();
      item.finished_at = null;
      item.result_status = null;
      item.result_message = null;
      item.updated_at = now.toISOString();
      claimed.push({ ...item });
    } finally {
      store.locks.delete(item.id);
    }
  }

  return claimed;
}

/**
 * Apply a successful/failed film result onto a queue row (pure).
 */
export function applyQueueResult(item, pipelineRow, now = new Date()) {
  const update = mapPipelineResultToQueueUpdate(pipelineRow);
  return {
    ...item,
    ...update,
    finished_at: now.toISOString(),
    locked_at: null,
    updated_at: now.toISOString(),
  };
}

/**
 * Reset a failed (or exhausted) item back to pending for a manual retry.
 */
export function buildManualRetryUpdate(item, now = new Date()) {
  if (
    item.status !== QUEUE_STATUS.FAILED &&
    item.status !== QUEUE_STATUS.COMPLETED_WITH_WARNINGS
  ) {
    throw new Error(
      `Only failed or warning rows can be re-queued (got ${item.status})`
    );
  }
  return {
    status: QUEUE_STATUS.PENDING,
    started_at: null,
    finished_at: null,
    locked_at: null,
    result_status: null,
    result_message: null,
    film_id: null,
    // Keep attempts so max_attempts still caps automatic retries;
    // bump max_attempts when intentionally forcing another try.
    updated_at: now.toISOString(),
  };
}

export function buildRunReport({
  startedAt,
  finishedAt,
  claimed,
  filmResults,
  remainingPending,
  pendingBefore = null,
  retryableFailed = 0,
  runUrl = null,
  systemError = null,
  dryRun = false,
  lowQueueThreshold = WEEKLY_IMPORT_DEFAULTS.lowQueueThreshold,
}) {
  const successful = filmResults.filter(
    (row) => row.queueStatus === QUEUE_STATUS.COMPLETED
  );
  const warnings = filmResults.filter(
    (row) => row.queueStatus === QUEUE_STATUS.COMPLETED_WITH_WARNINGS
  );
  const failed = filmResults.filter(
    (row) => row.queueStatus === QUEUE_STATUS.FAILED
  );

  let runStatus = "success";
  if (systemError) runStatus = "system_error";
  else if (dryRun) runStatus = "dry_run";
  else if (claimed.length === 0) runStatus = "empty_queue";
  else if (failed.length > 0 && successful.length + warnings.length > 0) {
    runStatus = "partial";
  } else if (failed.length > 0) runStatus = "failed";
  else if (warnings.length > 0 && successful.length === 0) {
    runStatus = "completed_with_warnings";
  }

  const durationMs = Math.max(
    0,
    new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  );

  const lowQueue = isLowFilmQueue(remainingPending, lowQueueThreshold);
  const lowQueueWarning = formatLowQueueWarning(
    remainingPending,
    lowQueueThreshold
  );

  return {
    startedAt,
    finishedAt,
    durationMs,
    runStatus,
    dryRun,
    claimedCount: claimed.length,
    successCount: successful.length,
    warningCount: warnings.length,
    failedCount: failed.length,
    pendingBefore: pendingBefore == null ? null : Number(pendingBefore) || 0,
    remainingPending,
    retryableFailed: Number(retryableFailed) || 0,
    lowQueueThreshold: Number(lowQueueThreshold) || WEEKLY_IMPORT_DEFAULTS.lowQueueThreshold,
    lowQueue,
    lowQueueWarning,
    runUrl,
    systemError: systemError
      ? sanitizePublicMessage(systemError, 200)
      : null,
    successfulTitles: dryRun
      ? claimed.map((row) => row.title)
      : successful.map((row) => row.title),
    warningFilms: warnings.map((row) => ({
      title: row.title,
      reason: row.resultMessage,
    })),
    failedFilms: failed.map((row) => ({
      title: row.title,
      reason: row.resultMessage,
    })),
  };
}

/**
 * Build the email subject for a weekly import report.
 * Empty queue and low pending stock get a visible ⚠️ prefix.
 */
export function formatWeeklyImportEmailSubject(report) {
  if (report.runStatus === "empty_queue" || report.remainingPending === 0) {
    return "⚠️ Resonale weekly import — queue is empty";
  }

  const added = report.successCount;
  const remaining = report.remainingPending;

  if (report.lowQueue) {
    return `⚠️ Resonale weekly import — ${added} added, only ${remaining} remaining`;
  }

  return `Resonale weekly import — ${added} added, ${remaining} remaining`;
}

export function resolveWeeklyImportExitCode(report) {
  if (report.runStatus === "system_error") return RUN_EXIT.FATAL;
  if (report.runStatus === "failed") return RUN_EXIT.FATAL;
  if (report.runStatus === "partial") return RUN_EXIT.PARTIAL;
  return RUN_EXIT.SUCCESS;
}

export function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function formatWeeklyImportEmail(report) {
  const lines = [
    `Resonale weekly film import — ${report.runStatus}`,
    `Started: ${report.startedAt}`,
    `Finished: ${report.finishedAt}`,
    `Duration: ${formatDuration(report.durationMs)}`,
    "",
  ];

  if (report.lowQueueWarning) {
    lines.push(`⚠️ ${report.lowQueueWarning}`, "");
  }

  lines.push(
    `Pending before run: ${report.pendingBefore ?? "—"}`,
    `Selected: ${report.claimedCount}`,
    `Succeeded: ${report.successCount}`,
    `Warnings: ${report.warningCount}`,
    `Failed: ${report.failedCount}`,
    `Remaining pending: ${report.remainingPending}`,
    `Retryable failed (manual retry): ${report.retryableFailed ?? 0}`
  );

  if (report.runUrl) {
    lines.push(`GitHub Actions run: ${report.runUrl}`);
  }

  if (report.systemError) {
    lines.push("", `System error: ${report.systemError}`);
  }

  if (report.successfulTitles.length) {
    lines.push("", "Successfully added:");
    for (const title of report.successfulTitles) {
      lines.push(`- ${title}`);
    }
  }

  if (report.warningFilms.length) {
    lines.push("", "Completed with warnings:");
    for (const film of report.warningFilms) {
      lines.push(`- ${film.title}: ${film.reason ?? "warning"}`);
    }
  }

  if (report.failedFilms.length) {
    lines.push("", "Failed:");
    for (const film of report.failedFilms) {
      lines.push(`- ${film.title}: ${film.reason ?? "error"}`);
    }
  }

  if (report.dryRun) {
    lines.push(
      "",
      "Dry-run only — no films were imported and queue rows were not locked."
    );
  }

  if (report.claimedCount === 0 && !report.systemError) {
    lines.push("", "Queue was empty — nothing to process.");
  }

  return {
    subject: formatWeeklyImportEmailSubject(report),
    text: `${lines.join("\n")}\n`,
  };
}

/**
 * Claim next batch via Supabase RPC.
 */
export async function claimFilmImportQueueItems(supabase, options = {}) {
  const limit = options.limit ?? WEEKLY_IMPORT_DEFAULTS.batchSize;
  const staleAfterMinutes =
    options.staleAfterMinutes ?? WEEKLY_IMPORT_DEFAULTS.staleAfterMinutes;
  const { data, error } = await supabase.rpc("claim_film_import_queue_items", {
    requested_limit: limit,
    stale_after_minutes: staleAfterMinutes,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Claim one specific pending (or stale processing) queue row by id.
 * Used right after Approve so prep does not wait behind other pending films.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} queueId
 * @param {{ staleAfterMinutes?: number, now?: Date }} [options]
 */
export async function claimFilmImportQueueItemById(
  supabase,
  queueId,
  options = {}
) {
  if (!queueId) throw new Error("queueId is required");
  const now = options.now ?? new Date();
  const staleAfterMinutes =
    options.staleAfterMinutes ?? WEEKLY_IMPORT_DEFAULTS.staleAfterMinutes;
  const staleBefore = new Date(
    now.getTime() - Math.max(staleAfterMinutes, 1) * 60_000
  ).toISOString();

  const { data: existing, error: loadError } = await supabase
    .from("film_import_queue")
    .select("*")
    .eq("id", queueId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!existing) {
    throw new Error(`Queue item not found: ${queueId}`);
  }

  const attempts = Number(existing.attempts) || 0;
  const maxAttempts =
    Number(existing.max_attempts) || WEEKLY_IMPORT_DEFAULTS.maxAttempts;
  if (attempts >= maxAttempts) {
    throw new Error(
      `Queue item ${queueId} exhausted attempts (${attempts}/${maxAttempts})`
    );
  }

  const isPending = existing.status === QUEUE_STATUS.PENDING;
  const isStaleProcessing =
    existing.status === QUEUE_STATUS.PROCESSING &&
    existing.locked_at &&
    existing.locked_at < staleBefore;
  if (!isPending && !isStaleProcessing) {
    return { claimed: false, item: existing, reason: existing.status };
  }

  const { data: claimed, error: claimError } = await supabase
    .from("film_import_queue")
    .update({
      status: QUEUE_STATUS.PROCESSING,
      attempts: attempts + 1,
      started_at: existing.started_at ?? now.toISOString(),
      locked_at: now.toISOString(),
      finished_at: null,
      result_status: null,
      result_message: null,
      updated_at: now.toISOString(),
    })
    .eq("id", queueId)
    .eq("status", existing.status)
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    return { claimed: false, item: existing, reason: "race_lost" };
  }
  return { claimed: true, item: claimed, reason: null };
}

/**
 * Claim + process one queue row by id (Approve → immediate prep).
 */
export async function processFilmImportQueueItemById({
  supabase,
  queueId,
  processFilmImportBatch,
  pipelineOptions = {},
  staleAfterMinutes,
}) {
  const claim = await claimFilmImportQueueItemById(supabase, queueId, {
    staleAfterMinutes,
  });
  if (!claim.claimed) {
    return {
      skipped: true,
      reason: claim.reason,
      queueId,
      title: claim.item?.title ?? null,
    };
  }

  try {
    const processed = await processClaimedQueueItem({
      item: claim.item,
      supabase,
      processFilmImportBatch,
      pipelineOptions,
    });
    await markQueueItemResult(supabase, queueId, processed.queueUpdate);
    return {
      skipped: false,
      queueId,
      title: processed.title,
      queueUpdate: processed.queueUpdate,
      checklist: processed.checklist,
      pipelineRow: processed.pipelineRow,
    };
  } catch (error) {
    const message = sanitizePublicMessage(
      error instanceof Error ? error.message : String(error)
    );
    const queueUpdate = {
      status: QUEUE_STATUS.FAILED,
      result_status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
      result_message: message,
      film_id: null,
    };
    await markQueueItemResult(supabase, queueId, queueUpdate);
    throw error;
  }
}

export async function countPendingFilmImportQueueItems(supabase) {
  const { data, error } = await supabase.rpc(
    "count_pending_film_import_queue_items"
  );
  if (error) throw error;
  return Number(data) || 0;
}

/**
 * Failed rows that can be re-queued without --bump-max-attempts
 * (attempts still below max_attempts). Not part of the pending stock.
 */
export function countRetryableFailedFromRows(rows) {
  return (rows ?? []).filter((row) => {
    if (row.status !== QUEUE_STATUS.FAILED) return false;
    const attempts = Number(row.attempts) || 0;
    const maxAttempts =
      Number(row.max_attempts) || WEEKLY_IMPORT_DEFAULTS.maxAttempts;
    return attempts < maxAttempts;
  }).length;
}

export async function countRetryableFailedFilmImportQueueItems(supabase) {
  const { data, error } = await supabase
    .from("film_import_queue")
    .select("id,status,attempts,max_attempts")
    .eq("status", QUEUE_STATUS.FAILED);
  if (error) throw error;
  return countRetryableFailedFromRows(data);
}

export async function markQueueItemResult(supabase, itemId, update) {
  const { error } = await supabase
    .from("film_import_queue")
    .update({
      status: update.status,
      result_status: update.result_status,
      result_message: update.result_message,
      film_id: update.film_id,
      finished_at: new Date().toISOString(),
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("status", QUEUE_STATUS.PROCESSING);
  if (error) throw error;
}

/**
 * Mark stale processing rows that have exhausted max_attempts as failed
 * so they do not sit locked forever after repeated crashes.
 */
export async function failExhaustedStaleProcessingItems(
  supabase,
  options = {}
) {
  const staleAfterMinutes =
    options.staleAfterMinutes ?? WEEKLY_IMPORT_DEFAULTS.staleAfterMinutes;
  const now = options.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - Math.max(1, staleAfterMinutes) * 60_000
  ).toISOString();

  const { data: listed, error: listError } = await supabase
    .from("film_import_queue")
    .select("id,title,attempts,max_attempts,locked_at,status")
    .eq("status", QUEUE_STATUS.PROCESSING)
    .lt("locked_at", staleBefore);
  if (listError) throw listError;

  const exhausted = (listed ?? []).filter(
    (row) => (Number(row.attempts) || 0) >= (Number(row.max_attempts) || 1)
  );
  const failed = [];
  for (const row of exhausted) {
    const { error: updateError } = await supabase
      .from("film_import_queue")
      .update({
        status: QUEUE_STATUS.FAILED,
        result_status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
        result_message: sanitizePublicMessage(
          "Abandoned after max attempts while stuck in processing"
        ),
        finished_at: now.toISOString(),
        locked_at: null,
        updated_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("status", QUEUE_STATUS.PROCESSING);
    if (updateError) throw updateError;
    failed.push(row);
  }
  return failed;
}

/**
 * Run one claimed queue item through the existing import pipeline.
 */
export async function processClaimedQueueItem({
  item,
  supabase,
  processFilmImportBatch,
  pipelineOptions = {},
}) {
  const candidateId =
    item.discovery_candidate_id ??
    item.payload?.discovery_candidate_id ??
    null;

  if (candidateId) {
    await supabase
      .from("film_discovery_candidates")
      .update({
        release_status: DISCOVERY_RELEASE_STATUS.prepping,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
  }

  const batch = {
    batch_name: `queue-${item.id}`,
    films: [item.payload],
  };

  const result = await processFilmImportBatch({
    supabase,
    batch,
    options: {
      dryRun: false,
      execute: true,
      skipMedia: false,
      waitForJobs: false,
      rebuildAllProfiles: false,
      file: null,
      filmIds: [],
      ...pipelineOptions,
    },
  });

  const pipelineRow = result?.results?.[0] ?? {
    title: item.title,
    status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
    error: "Pipeline returned no result for film",
  };

  const queueUpdate = mapPipelineResultToQueueUpdate(pipelineRow);
  const checklist = mergeReleaseChecklist(
    item.result_checklist,
    pipelineRow.checklist ?? {}
  );

  if (
    pipelineRow.status === PIPELINE_STATUS.CATALOG_READY ||
    pipelineRow.status === PIPELINE_STATUS.RANKING_READY
  ) {
    checklist.profile_scores = checklist.profile_scores ?? "deferred";
  }

  const { error: checklistError } = await supabase
    .from("film_import_queue")
    .update({
      result_checklist: checklist,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);
  if (checklistError) {
    console.warn(
      `Failed to persist result_checklist for ${item.id}: ${checklistError.message}`
    );
  }

  if (candidateId) {
    const releaseStatus =
      pipelineRow.status === PIPELINE_STATUS.CATALOG_READY ||
      pipelineRow.status === PIPELINE_STATUS.RANKING_READY
        ? DISCOVERY_RELEASE_STATUS.readyForRelease
        : pipelineRow.status === PIPELINE_STATUS.DUPLICATE_SKIPPED
          ? DISCOVERY_RELEASE_STATUS.failed
          : DISCOVERY_RELEASE_STATUS.failed;
    const filmId =
      pipelineRow.filmId ??
      pipelineRow.existingFilmId ??
      queueUpdate.film_id ??
      null;
    await supabase
      .from("film_discovery_candidates")
      .update({
        release_status: releaseStatus,
        film_id: filmId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
  }

  return {
    title: item.title ?? pipelineRow.title,
    queueId: item.id,
    pipelineRow,
    queueUpdate,
    checklist,
  };
}

/**
 * Full weekly job orchestration.
 */
export async function runWeeklyFilmImport({
  supabase,
  processFilmImportBatch,
  sendEmail,
  options = {},
}) {
  const startedAt = (options.now ?? new Date()).toISOString();
  const batchSize = options.batchSize ?? WEEKLY_IMPORT_DEFAULTS.batchSize;
  const staleAfterMinutes =
    options.staleAfterMinutes ?? WEEKLY_IMPORT_DEFAULTS.staleAfterMinutes;
  const lowQueueThreshold =
    options.lowQueueThreshold ?? WEEKLY_IMPORT_DEFAULTS.lowQueueThreshold;
  const dryRun = Boolean(options.dryRun);
  const runUrl = options.runUrl ?? null;

  /** @type {Array<Record<string, unknown>>} */
  let claimed = [];
  /** @type {Array<{ title: string, queueStatus: string, resultMessage: string | null }>} */
  const filmResults = [];
  let systemError = null;
  let pendingBefore = 0;
  let remainingPending = 0;
  let retryableFailed = 0;

  try {
    if (!dryRun) {
      await failExhaustedStaleProcessingItems(supabase, {
        staleAfterMinutes,
        now: options.now ?? new Date(),
      });
    }

    pendingBefore = await countPendingFilmImportQueueItems(supabase);

    if (dryRun) {
      // Preview claimable rows without locking — uses pending count / select via table.
      const { data, error } = await supabase
        .from("film_import_queue")
        .select(
          "id,title,year,status,attempts,max_attempts,sort_order,created_at,locked_at"
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(Math.max(batchSize * 5, batchSize));
      if (error) throw error;
      claimed = selectClaimableQueueItems(data ?? [], {
        limit: batchSize,
        staleAfterMinutes,
        now: options.now ?? new Date(),
      });
    } else {
      claimed = await claimFilmImportQueueItems(supabase, {
        limit: batchSize,
        staleAfterMinutes,
      });
    }

    if (!dryRun) {
      for (const item of claimed) {
        try {
          const processed = await processClaimedQueueItem({
            item,
            supabase,
            processFilmImportBatch,
            pipelineOptions: options.pipelineOptions,
          });
          await markQueueItemResult(supabase, item.id, processed.queueUpdate);
          filmResults.push({
            title: processed.title,
            queueStatus: processed.queueUpdate.status,
            resultMessage: processed.queueUpdate.result_message,
          });
        } catch (error) {
          const message = sanitizePublicMessage(
            error instanceof Error ? error.message : String(error)
          );
          const queueUpdate = {
            status: QUEUE_STATUS.FAILED,
            result_status: PIPELINE_STATUS.FAILED_ROLLED_BACK,
            result_message: message,
            film_id: null,
          };
          try {
            await markQueueItemResult(supabase, item.id, queueUpdate);
          } catch (markError) {
            console.error(
              `Failed to persist queue failure for ${item.id}:`,
              markError instanceof Error ? markError.message : markError
            );
          }
          filmResults.push({
            title: item.title,
            queueStatus: QUEUE_STATUS.FAILED,
            resultMessage: message,
          });
        }
      }
    }

    remainingPending = await countPendingFilmImportQueueItems(supabase);
    retryableFailed = await countRetryableFailedFilmImportQueueItems(supabase);
  } catch (error) {
    systemError = error instanceof Error ? error.message : String(error);
    try {
      remainingPending = await countPendingFilmImportQueueItems(supabase);
    } catch {
      remainingPending = 0;
    }
    try {
      retryableFailed = await countRetryableFailedFilmImportQueueItems(supabase);
    } catch {
      retryableFailed = 0;
    }
  }

  const finishedAt = new Date().toISOString();
  const report = buildRunReport({
    startedAt,
    finishedAt,
    claimed,
    filmResults,
    pendingBefore,
    remainingPending,
    retryableFailed,
    runUrl,
    systemError,
    dryRun,
    lowQueueThreshold,
  });

  let emailSent = false;
  let emailError = null;
  if (typeof sendEmail === "function") {
    try {
      await sendEmail(report);
      emailSent = true;
    } catch (error) {
      emailError = sanitizePublicMessage(
        error instanceof Error ? error.message : String(error)
      );
      console.error(`Weekly import email failed: ${emailError}`);
    }
  }

  return {
    report,
    exitCode: resolveWeeklyImportExitCode(report),
    emailSent,
    emailError,
    dryRun,
  };
}
