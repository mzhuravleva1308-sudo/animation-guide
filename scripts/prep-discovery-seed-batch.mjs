#!/usr/bin/env node
/**
 * Prepare discovery candidates from a seed batch for release (no Go Live):
 * content → media → approve (if pending) → enqueue → prep.
 * Leaves films catalog_visible=false / ready_for_release.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/prep-discovery-seed-batch.mjs \
 *     --file tmp/animafest/seed/animafest-2010-2026.json --dry-run
 *
 *   DISCOVERY_SEED_PREP_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/prep-discovery-seed-batch.mjs \
 *     --file tmp/animafest/seed/animafest-2010-2026.json
 *
 * Flags:
 *   --skip-content  --skip-media  --skip-approve-prep
 *   --limit N
 */

import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { normalizeFilmString } from "../lib/film-duplicate-check.mjs";
import {
  DISCOVERY_CONTENT_STATUS,
  DISCOVERY_MEDIA_STATUS,
  DISCOVERY_REVIEW_STATUS,
} from "../lib/film-discovery.mjs";
import {
  buildContentCandidatePatch,
  curateDiscoveryContent,
} from "../lib/film-discovery-content.mjs";
import {
  buildMediaCandidatePatch,
  curateDiscoveryMedia,
} from "../lib/film-discovery-media.mjs";
import { buildApproveCandidatePatch } from "../lib/film-discovery-workflow.mjs";
import { enqueueDiscoveryCandidateForRelease } from "../lib/discovery-release-enqueue.mjs";
import { runDiscoveryReleasePrepForQueueId } from "../lib/run-discovery-release-prep.mjs";
import { DISCOVERY_RELEASE_STATUS } from "../lib/discovery-to-import-payload.mjs";

const NON_DB_FLAGS = new Set([
  "writes_to_films_table",
  "publish",
  "enrich_full",
  "review_status_unchanged",
  "media_status_unchanged",
  "identity_fields_unchanged",
  "email_sent",
  "identity_before",
  "identity_after",
  "identity_unchanged",
  "diagnostics",
  "processing_error",
  "skipped",
  "reason",
  "trailer_origin",
  "youtube_search_attempted",
  "youtube_quota_hit",
]);

/**
 * @param {Record<string, unknown>} patch
 */
function dbOnlyPatch(patch) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (NON_DB_FLAGS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function parseArgs(argv) {
  const options = {
    file: null,
    dryRun: false,
    skipContent: false,
    skipMedia: false,
    skipApprovePrep: false,
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") options.file = argv[++i];
    else if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-content") options.skipContent = true;
    else if (arg === "--skip-media") options.skipMedia = true;
    else if (arg === "--skip-approve-prep") options.skipApprovePrep = true;
    else if (arg === "--limit") options.limit = Number.parseInt(argv[++i], 10);
    else if (arg.startsWith("--limit="))
      options.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error("--file is required");
  if (
    options.limit != null &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  ) {
    throw new Error("--limit must be a positive integer");
  }
  return options;
}

function identityKey(title, year) {
  const norm = normalizeFilmString(title ?? "");
  if (!norm || !Number.isInteger(year)) return null;
  return `${norm}:${year}`;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} ids
 */
async function loadCandidatesByIds(supabase, ids) {
  if (!ids.length) return [];
  /** @type {object[]} */
  const rows = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("film_discovery_candidates")
      .select("*")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const batch = JSON.parse(
    await fs.readFile(path.resolve(options.file), "utf8")
  );
  if (!batch?.batch_name || !Array.isArray(batch.films)) {
    throw new Error("Invalid seed batch file");
  }

  /** @type {Set<string>} */
  const wanted = new Set();
  for (const film of batch.films) {
    const key = identityKey(film.title, film.year);
    if (key) wanted.add(key);
    if (film.original_title) {
      const originalKey = identityKey(film.original_title, film.year);
      if (originalKey) wanted.add(originalKey);
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

  const { data: allManual, error } = await supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, original_title, year, review_status, release_status, content_status, media_status, normalized_title, normalized_original_title, synopsis, the_mood, technique"
    )
    .eq("source", "manual_seed");
  if (error) throw error;

  let targets = (allManual ?? []).filter((row) => {
    const keys = [
      identityKey(row.normalized_title || row.title, row.year),
      identityKey(row.title, row.year),
      identityKey(
        row.normalized_original_title || row.original_title,
        row.year
      ),
    ].filter(Boolean);
    if (!keys.some((k) => wanted.has(k))) return false;
    // Skip already released / reject — only prep work queue.
    if (row.release_status === DISCOVERY_RELEASE_STATUS.released) return false;
    if (row.review_status === DISCOVERY_REVIEW_STATUS.rejected) return false;
    return (
      row.review_status === DISCOVERY_REVIEW_STATUS.pendingReview ||
      row.release_status === DISCOVERY_RELEASE_STATUS.blocked ||
      row.release_status === DISCOVERY_RELEASE_STATUS.failed ||
      row.release_status === DISCOVERY_RELEASE_STATUS.notQueued ||
      row.release_status === DISCOVERY_RELEASE_STATUS.queued ||
      row.release_status === DISCOVERY_RELEASE_STATUS.prepping
    );
  });

  if (options.limit) targets = targets.slice(0, options.limit);

  const plan = {
    batch_name: batch.batch_name,
    matched: targets.length,
    need_content: targets.filter(
      (row) =>
        !row.synopsis ||
        !row.the_mood ||
        !Array.isArray(row.technique) ||
        row.technique.length === 0 ||
        ![
          DISCOVERY_CONTENT_STATUS.ready,
          DISCOVERY_CONTENT_STATUS.readyWithNote,
        ].includes(row.content_status)
    ).length,
    need_media: targets.filter(
      (row) =>
        row.media_status !== DISCOVERY_MEDIA_STATUS.complete &&
        row.media_status !== DISCOVERY_MEDIA_STATUS.partial
    ).length,
    pending_review: targets.filter(
      (row) => row.review_status === DISCOVERY_REVIEW_STATUS.pendingReview
    ).length,
    blocked: targets.filter(
      (row) => row.release_status === DISCOVERY_RELEASE_STATUS.blocked
    ).length,
    sample: targets.slice(0, 8).map((row) => ({
      title: row.title,
      year: row.year,
      review_status: row.review_status,
      release_status: row.release_status,
      content_status: row.content_status,
      media_status: row.media_status,
    })),
  };

  if (options.dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, ...plan }, null, 2));
    return;
  }

  if (process.env.DISCOVERY_SEED_PREP_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with DISCOVERY_SEED_PREP_CONFIRM=1 after --dry-run."
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const tmdbApiKey = process.env.TMDB_API_KEY;
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  if (!options.skipContent && !openaiKey) {
    throw new Error("OPENAI_API_KEY required for content");
  }
  if (!options.skipMedia && !tmdbApiKey) {
    throw new Error("TMDB_API_KEY required for media");
  }

  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
  const ids = targets.map((row) => row.id);
  /** @type {object[]} */
  const results = [];

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const [candidate] = await loadCandidatesByIds(supabase, [id]);
    if (!candidate) {
      results.push({ id, status: "missing" });
      continue;
    }

    const rowResult = {
      id,
      title: candidate.title,
      year: candidate.year,
      content: null,
      media: null,
      release: null,
      prep: null,
    };

    console.log(
      `\n[${index + 1}/${ids.length}] ${candidate.title} (${candidate.year})`
    );

    if (!options.skipContent) {
      const needsContent =
        !candidate.synopsis ||
        !candidate.the_mood ||
        !Array.isArray(candidate.technique) ||
        candidate.technique.length === 0 ||
        ![
          DISCOVERY_CONTENT_STATUS.ready,
          DISCOVERY_CONTENT_STATUS.readyWithNote,
        ].includes(candidate.content_status);
      if (needsContent) {
        const content = await curateDiscoveryContent(candidate, {
          openai,
          tmdbApiKey,
        });
        if (!content.skipped) {
          const persist = dbOnlyPatch(
            buildContentCandidatePatch({
              synopsis: content.synopsis,
              the_mood: content.the_mood,
              technique: content.technique,
              moods: content.moods,
              aesthetic_tags: content.aesthetic_tags,
              quick_filters: content.quick_filters,
              content_status: content.content_status,
              content_note: content.content_note,
              content_revision_count: content.content_revision_count ?? 0,
            })
          );
          const { error: contentError } = await supabase
            .from("film_discovery_candidates")
            .update(persist)
            .eq("id", id);
          if (contentError) throw contentError;
        }
        rowResult.content = {
          skipped: Boolean(content.skipped),
          reason: content.reason ?? null,
          content_status: content.content_status ?? null,
        };
        console.log(
          `  content: ${rowResult.content.content_status ?? rowResult.content.reason ?? "?"}`
        );
      } else {
        rowResult.content = { skipped: true, reason: "already_ready" };
        console.log("  content: already_ready");
      }
    }

    if (!options.skipMedia) {
      const [afterContent] = await loadCandidatesByIds(supabase, [id]);
      const needsMedia =
        afterContent.media_status !== DISCOVERY_MEDIA_STATUS.complete;
      if (needsMedia) {
        const media = await curateDiscoveryMedia(afterContent, {
          tmdbApiKey,
          youtubeApiKey,
        });
        if (!media.skipped) {
          const persist = dbOnlyPatch(
            buildMediaCandidatePatch(media, {
              previousAttempts: afterContent.media_attempts ?? 0,
            })
          );
          const { error: mediaError } = await supabase
            .from("film_discovery_candidates")
            .update(persist)
            .eq("id", id);
          if (mediaError) throw mediaError;
        }
        rowResult.media = {
          skipped: Boolean(media.skipped),
          reason: media.reason ?? null,
          media_status: media.media_status ?? null,
        };
        console.log(
          `  media: ${rowResult.media.media_status ?? rowResult.media.reason ?? "?"}`
        );
      } else {
        rowResult.media = { skipped: true, reason: "already_complete" };
        console.log("  media: already_complete");
      }
    }

    if (!options.skipApprovePrep) {
      let [full] = await loadCandidatesByIds(supabase, [id]);

      if (full.review_status === DISCOVERY_REVIEW_STATUS.pendingReview) {
        const patch = buildApproveCandidatePatch(full);
        const {
          publish: _p,
          enrich: _e,
          insert_into_films: _i,
          catalog_visible: _c,
          ...dbPatch
        } = patch;
        const { error: approveError } = await supabase
          .from("film_discovery_candidates")
          .update(dbPatch)
          .eq("id", id)
          .eq("review_status", DISCOVERY_REVIEW_STATUS.pendingReview);
        if (approveError) throw approveError;
        [full] = await loadCandidatesByIds(supabase, [id]);
      }

      const release = await enqueueDiscoveryCandidateForRelease(supabase, full, {
        replaceActive: true,
      });
      rowResult.release = {
        status: release.status,
        blockers: release.blockers,
        queueId: release.queueId,
      };
      console.log(
        `  release: ${release.status}${
          release.blockers?.length ? ` (${release.blockers.join(",")})` : ""
        }`
      );

      if (
        release.queueId &&
        release.status !== "blocked" &&
        release.status !== "failed"
      ) {
        const prep = await runDiscoveryReleasePrepForQueueId(
          supabase,
          release.queueId
        );
        rowResult.prep = {
          status: prep.queueUpdate?.status ?? prep.reason ?? null,
          skipped: Boolean(prep.skipped),
        };
        console.log(`  prep: ${rowResult.prep.status ?? "?"}`);
      }
    }

    results.push(rowResult);
  }

  const summary = {
    ok: true,
    dryRun: false,
    matched: ids.length,
    content_ready: results.filter((r) =>
      ["ready", "ready_with_note"].includes(r.content?.content_status)
    ).length,
    media_complete_or_partial: results.filter((r) =>
      ["media_complete", "media_partial"].includes(r.media?.media_status)
    ).length,
    release_queued_or_prepped: results.filter((r) =>
      ["added", "replaced_active", "skipped_already_queued", "ADDED", "REPLACED_ACTIVE"].includes(
        String(r.release?.status)
      ) || r.prep
    ).length,
    still_blocked: results.filter((r) => r.release?.status === "blocked").length,
    results_path: "tmp/animafest/prep-results.json",
  };

  await fs.mkdir(path.resolve("tmp/animafest"), { recursive: true });
  await fs.writeFile(
    path.resolve("tmp/animafest/prep-results.json"),
    `${JSON.stringify({ summary, results }, null, 2)}\n`,
    "utf8"
  );
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
