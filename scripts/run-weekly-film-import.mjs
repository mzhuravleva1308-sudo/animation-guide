#!/usr/bin/env node
/**
 * Weekly film import orchestration entrypoint.
 *
 * Claims the next N pending films from film_import_queue, runs each through
 * processFilmImportBatch independently, persists per-film results, emails a report.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/run-weekly-film-import.mjs
 *   APP_ENV=hosted node scripts/run-weekly-film-import.mjs --batch-size 5
 *   APP_ENV=hosted node scripts/run-weekly-film-import.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { processFilmImportBatch } from "./process-film-batch.mjs";
import {
  RUN_EXIT,
  WEEKLY_IMPORT_DEFAULTS,
  runWeeklyFilmImport,
} from "../lib/film-import-queue.mjs";
import { sendWeeklyFilmImportEmail } from "../lib/send-weekly-film-import-email.mjs";

function parseArgs(argv) {
  const options = {
    batchSize: Number(process.env.WEEKLY_FILM_IMPORT_BATCH_SIZE) ||
      WEEKLY_IMPORT_DEFAULTS.batchSize,
    staleAfterMinutes:
      Number(process.env.WEEKLY_FILM_IMPORT_STALE_MINUTES) ||
      WEEKLY_IMPORT_DEFAULTS.staleAfterMinutes,
    lowQueueThreshold:
      Number(process.env.WEEKLY_FILM_IMPORT_LOW_QUEUE_THRESHOLD) ||
      WEEKLY_IMPORT_DEFAULTS.lowQueueThreshold,
    dryRun: false,
    skipEmail: process.env.WEEKLY_FILM_IMPORT_SKIP_EMAIL === "1",
    runUrl: process.env.GITHUB_RUN_URL || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--batch-size") {
      options.batchSize = Number(argv[++index]);
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg === "--stale-minutes") {
      options.staleAfterMinutes = Number(argv[++index]);
    } else if (arg.startsWith("--stale-minutes=")) {
      options.staleAfterMinutes = Number(arg.slice("--stale-minutes=".length));
    } else if (arg === "--low-queue-threshold") {
      options.lowQueueThreshold = Number(argv[++index]);
    } else if (arg.startsWith("--low-queue-threshold=")) {
      options.lowQueueThreshold = Number(
        arg.slice("--low-queue-threshold=".length)
      );
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-email") {
      options.skipEmail = true;
    } else if (arg === "--run-url") {
      options.runUrl = argv[++index];
    } else if (arg.startsWith("--run-url=")) {
      options.runUrl = arg.slice("--run-url=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (
    !Number.isInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 50
  ) {
    throw new Error("--batch-size must be an integer between 1 and 50");
  }
  if (
    !Number.isInteger(options.staleAfterMinutes) ||
    options.staleAfterMinutes < 1
  ) {
    throw new Error("--stale-minutes must be a positive integer");
  }
  if (
    !Number.isInteger(options.lowQueueThreshold) ||
    options.lowQueueThreshold < 1
  ) {
    throw new Error("--low-queue-threshold must be a positive integer");
  }

  return options;
}

function writeGithubSummary(report, meta) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  const lines = [
    "## Weekly film import",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Status | \`${report.runStatus}\` |`,
    `| Pending before | ${report.pendingBefore ?? "—"} |`,
    `| Selected | ${report.claimedCount} |`,
    `| Succeeded | ${report.successCount} |`,
    `| Warnings | ${report.warningCount} |`,
    `| Failed | ${report.failedCount} |`,
    `| Remaining pending | ${report.remainingPending} |`,
    `| Retryable failed | ${report.retryableFailed ?? 0} |`,
    `| Low queue | ${report.lowQueue ? "yes" : "no"} |`,
    `| Duration | ${Math.round(report.durationMs / 1000)}s |`,
    `| Dry run | ${meta.dryRun ? "yes" : "no"} |`,
    `| Email sent | ${meta.emailSent ? "yes" : "no"} |`,
    "",
  ];
  if (report.lowQueueWarning) {
    lines.push(`> ⚠️ ${report.lowQueueWarning}`, "");
  }
  if (report.successfulTitles.length) {
    lines.push("### Succeeded", ...report.successfulTitles.map((t) => `- ${t}`), "");
  }
  if (report.failedFilms.length) {
    lines.push(
      "### Failed",
      ...report.failedFilms.map((f) => `- ${f.title}: ${f.reason ?? ""}`),
      ""
    );
  }
  if (report.systemError) {
    lines.push("### System error", report.systemError, "");
  }
  return import("node:fs").then((fs) =>
    fs.appendFileSync(path, `${lines.join("\n")}\n`)
  );
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(url, key);
  const sendEmail = options.skipEmail
    ? null
    : (report) => sendWeeklyFilmImportEmail(report);

  console.log(
    `Weekly film import starting (batchSize=${options.batchSize}, dryRun=${options.dryRun})`
  );

  const outcome = await runWeeklyFilmImport({
    supabase,
    processFilmImportBatch,
    sendEmail,
    options: {
      batchSize: options.batchSize,
      staleAfterMinutes: options.staleAfterMinutes,
      lowQueueThreshold: options.lowQueueThreshold,
      dryRun: options.dryRun,
      runUrl: options.runUrl,
    },
  });

  const { report } = outcome;
  console.log(
    `Weekly film import finished: status=${report.runStatus} pendingBefore=${report.pendingBefore} selected=${report.claimedCount} ok=${report.successCount} warn=${report.warningCount} failed=${report.failedCount} remaining=${report.remainingPending} retryableFailed=${report.retryableFailed}${report.lowQueue ? " LOW_QUEUE" : ""}`
  );
  if (report.systemError) {
    console.error(`System error: ${report.systemError}`);
  }
  if (outcome.emailError) {
    console.error(`Email error: ${outcome.emailError}`);
  }

  await writeGithubSummary(report, outcome);

  // Email failure after a successful import should not hide film failures,
  // but a missing email on an otherwise clean run is still a soft problem.
  if (outcome.emailError && outcome.exitCode === RUN_EXIT.SUCCESS) {
    process.exitCode = RUN_EXIT.PARTIAL;
    return;
  }
  process.exitCode = outcome.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      `run-weekly-film-import failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = RUN_EXIT.FATAL;
  });
}

export { parseArgs };
