#!/usr/bin/env node
/**
 * Bulk-approve pending discovery candidates that match a seed batch file
 * (Animafest or any discovery-minimal JSON). Enqueues release + runs prep
 * the same way as /api/admin/film-discovery/review approve.
 *
 * Candidates are matched by title+year (and original_title when present).
 * There is no batch_name column on film_discovery_candidates — use --file.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/bulk-approve-discovery-batch.mjs \
 *     --file tmp/animafest/seed/animafest-2011.json --dry-run
 *
 *   DISCOVERY_BULK_APPROVE_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/bulk-approve-discovery-batch.mjs \
 *     --file tmp/animafest/seed/animafest-2011.json
 *
 *   APP_ENV=hosted node scripts/bulk-approve-discovery-batch.mjs \
 *     --dir tmp/animafest/seed --prefix animafest- --dry-run
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { DISCOVERY_REVIEW_STATUS } from "../lib/film-discovery.mjs";
import { buildApproveCandidatePatch } from "../lib/film-discovery-workflow.mjs";
import { normalizeFilmString } from "../lib/film-duplicate-check.mjs";
import { enqueueDiscoveryCandidateForRelease } from "../lib/discovery-release-enqueue.mjs";
import { runDiscoveryReleasePrepForQueueId } from "../lib/run-discovery-release-prep.mjs";

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const options = {
    file: null,
    dir: null,
    prefix: null,
    batchName: null,
    dryRun: false,
    skipPrep: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") options.file = argv[++i];
    else if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
    else if (arg === "--dir") options.dir = argv[++i];
    else if (arg.startsWith("--dir=")) options.dir = arg.slice("--dir=".length);
    else if (arg === "--prefix") options.prefix = argv[++i];
    else if (arg.startsWith("--prefix="))
      options.prefix = arg.slice("--prefix=".length);
    else if (arg === "--batch-name") options.batchName = argv[++i];
    else if (arg.startsWith("--batch-name="))
      options.batchName = arg.slice("--batch-name=".length);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-prep") options.skipPrep = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.file && !options.dir && !options.batchName) {
    throw new Error("Pass --file, --dir, or --batch-name");
  }
  return options;
}

/**
 * @param {object} film
 */
function identityKeysForSeedFilm(film) {
  /** @type {string[]} */
  const keys = [];
  const year = film.year;
  if (!Number.isInteger(year)) return keys;
  const titleNorm = normalizeFilmString(film.title ?? "");
  if (titleNorm) keys.push(`title:${titleNorm}:${year}`);
  const originalNorm = normalizeFilmString(film.original_title ?? "");
  if (originalNorm) keys.push(`original:${originalNorm}:${year}`);
  return keys;
}

/**
 * @param {object} candidate
 */
function identityKeysForCandidate(candidate) {
  /** @type {string[]} */
  const keys = [];
  const year = candidate.year;
  if (!Number.isInteger(year)) return keys;
  const titleNorm =
    candidate.normalized_title ||
    normalizeFilmString(candidate.title ?? "");
  if (titleNorm) keys.push(`title:${titleNorm}:${year}`);
  const originalNorm =
    candidate.normalized_original_title ||
    normalizeFilmString(candidate.original_title ?? "");
  if (originalNorm) keys.push(`original:${originalNorm}:${year}`);
  return keys;
}

/**
 * @param {string} filePath
 */
async function loadSeedBatch(filePath) {
  const batch = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!batch?.batch_name || !Array.isArray(batch.films)) {
    throw new Error(`Invalid seed batch: ${filePath}`);
  }
  return batch;
}

/**
 * @param {string} dir
 * @param {string | null} prefix
 */
async function listSeedFiles(dir, prefix) {
  const entries = await fs.readdir(dir);
  return entries
    .filter((name) => name.endsWith(".json"))
    .filter((name) => (prefix ? name.startsWith(prefix) : true))
    .filter((name) => !/^\d{4}-\d{4}\.json$/.test(name.replace(/^animafest-/, "")))
    .map((name) => path.join(dir, name))
    .sort();
}

/**
 * Prefer single-year seed files over the combined range file when using --dir.
 * @param {string[]} files
 */
function preferYearSeedFiles(files) {
  const yearFiles = files.filter((filePath) =>
    /animafest-\d{4}\.json$/i.test(path.basename(filePath))
  );
  return yearFiles.length > 0 ? yearFiles : files;
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));

  /** @type {string[]} */
  let files = [];
  if (options.file) {
    files = [path.resolve(options.file)];
  } else if (options.batchName) {
    const guessed = path.resolve(
      "tmp",
      "animafest",
      "seed",
      `${options.batchName}.json`
    );
    files = [guessed];
  } else if (options.dir) {
    files = preferYearSeedFiles(
      await listSeedFiles(path.resolve(options.dir), options.prefix)
    );
  }

  if (files.length === 0) {
    throw new Error("No seed files found");
  }

  /** @type {Map<string, { batch_name: string, film: object, file: string }>} */
  const wanted = new Map();
  for (const filePath of files) {
    const batch = await loadSeedBatch(filePath);
    for (const film of batch.films) {
      for (const key of identityKeysForSeedFilm(film)) {
        if (!wanted.has(key)) {
          wanted.set(key, {
            batch_name: batch.batch_name,
            film,
            file: filePath,
          });
        }
      }
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pending, error } = await supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, original_title, year, review_status, normalized_title, normalized_original_title, release_status, release_queue_id, source"
    )
    .eq("review_status", DISCOVERY_REVIEW_STATUS.pendingReview);
  if (error) throw error;

  /** @type {object[]} */
  const matches = [];
  /** @type {Set<string>} */
  const matchedIds = new Set();
  for (const candidate of pending ?? []) {
    const keys = identityKeysForCandidate(candidate);
    const hit = keys.some((key) => wanted.has(key));
    if (!hit || matchedIds.has(candidate.id)) continue;
    matchedIds.add(candidate.id);
    matches.push(candidate);
  }

  const report = {
    dryRun: options.dryRun,
    seed_files: files,
    seed_identity_keys: wanted.size,
    pending_review_total: (pending ?? []).length,
    matched: matches.length,
    matched_titles: matches.map((row) => `${row.title} (${row.year})`),
  };

  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (process.env.DISCOVERY_BULK_APPROVE_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with DISCOVERY_BULK_APPROVE_CONFIRM=1 after reviewing --dry-run."
    );
  }

  /** @type {object[]} */
  const results = [];
  for (const candidate of matches) {
    const { data: full, error: fullError } = await supabase
      .from("film_discovery_candidates")
      .select("*")
      .eq("id", candidate.id)
      .single();
    if (fullError) throw fullError;

    if (full.review_status !== DISCOVERY_REVIEW_STATUS.pendingReview) {
      results.push({
        id: full.id,
        title: full.title,
        status: "already_reviewed",
        review_status: full.review_status,
      });
      continue;
    }

    const patch = buildApproveCandidatePatch(full);
    const {
      publish: _publish,
      enrich: _enrich,
      insert_into_films: _insert,
      catalog_visible: _visible,
      ...dbPatch
    } = patch;

    const { error: approveError } = await supabase
      .from("film_discovery_candidates")
      .update(dbPatch)
      .eq("id", full.id)
      .eq("review_status", DISCOVERY_REVIEW_STATUS.pendingReview);
    if (approveError) throw approveError;

    const { data: approved, error: reloadError } = await supabase
      .from("film_discovery_candidates")
      .select("*")
      .eq("id", full.id)
      .single();
    if (reloadError) throw reloadError;

    const release = await enqueueDiscoveryCandidateForRelease(
      supabase,
      approved
    );
    const queueId =
      typeof release.queueId === "string" ? release.queueId : null;

    let prep = null;
    if (
      !options.skipPrep &&
      queueId &&
      release.status !== "blocked" &&
      release.status !== "failed"
    ) {
      prep = await runDiscoveryReleasePrepForQueueId(supabase, queueId);
    }

    results.push({
      id: full.id,
      title: full.title,
      year: full.year,
      status: "approved",
      release_status: release.status,
      queueId,
      blockers: release.blockers,
      prep: prep
        ? {
            queueUpdateStatus: prep.queueUpdate?.status ?? null,
          }
        : null,
    });
    console.log(
      `[approved] ${full.title} (${full.year}) → ${release.status}${
        queueId ? ` queue=${queueId}` : ""
      }`
    );
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        approved: results.filter((row) => row.status === "approved").length,
        results,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
