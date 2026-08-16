#!/usr/bin/env node
/**
 * Apply LA tag-eval dry-run content onto candidates, scrub animation-biased
 * technique/aesthetic tags, then optionally approve → prep → media_type → go-live.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/release-la-tag-eval.mjs --apply-content
 *   WEEKLY_FILM_DISCOVERY_MEDIA_CONFIRM=1 APP_ENV=hosted node scripts/release-la-tag-eval.mjs --media
 *   APP_ENV=hosted node scripts/release-la-tag-eval.mjs --approve-prep
 *   APP_ENV=hosted node scripts/release-la-tag-eval.mjs --set-media-type
 *   APP_ENV=hosted node scripts/release-la-tag-eval.mjs --go-live
 *   APP_ENV=hosted node scripts/release-la-tag-eval.mjs --all
 *
 * Optional paths (defaults keep the original 50-film eval files):
 *   --ids-file tmp/la-release-4-ids.json
 *   --content-file tmp/la-content-dry-run-4.json
 *   --report-file tmp/la-release-4-report.json
 */

import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { MEDIA_TYPE } from "../lib/media-type.mjs";
import { DISCOVERY_REVIEW_STATUS } from "../lib/film-discovery.mjs";
import { buildApproveCandidatePatch } from "../lib/film-discovery-workflow.mjs";
import { enqueueDiscoveryCandidateForRelease } from "../lib/discovery-release-enqueue.mjs";
import { runDiscoveryReleasePrepForQueueId } from "../lib/run-discovery-release-prep.mjs";
import { goLiveFilmBatch } from "../lib/film-release-go-live.mjs";
import {
  curateDiscoveryMedia,
  buildMediaCandidatePatch,
} from "../lib/film-discovery-media.mjs";

const DEFAULT_IDS_FILE = "tmp/la-tag-eval-50-ids.json";
const DEFAULT_CONTENT_FILE = "tmp/la-content-dry-run-50.json";
const DEFAULT_REPORT_FILE = "tmp/la-tag-eval-release-report.json";
const FALLBACK_AESTHETIC = Object.freeze([
  "muted color palette",
  "naturalistic lighting",
  "organic textures",
]);

const ANIMATION_AESTHETIC_RE =
  /hand[- ]?drawn|storybook|puppet|anime|stop[- ]?motion|facial animation|\bcel\b|animated|2d|3d cgi|cgi world/i;

function parseArgs(argv) {
  const options = {
    applyContent: false,
    media: false,
    approvePrep: false,
    setMediaType: false,
    goLive: false,
    all: false,
    idsFile: DEFAULT_IDS_FILE,
    contentFile: DEFAULT_CONTENT_FILE,
    reportFile: DEFAULT_REPORT_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply-content") options.applyContent = true;
    else if (arg === "--media") options.media = true;
    else if (arg === "--approve-prep") options.approvePrep = true;
    else if (arg === "--set-media-type") options.setMediaType = true;
    else if (arg === "--go-live") options.goLive = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--ids-file") options.idsFile = argv[++index];
    else if (arg.startsWith("--ids-file=")) options.idsFile = arg.slice("--ids-file=".length);
    else if (arg === "--content-file") options.contentFile = argv[++index];
    else if (arg.startsWith("--content-file=")) {
      options.contentFile = arg.slice("--content-file=".length);
    } else if (arg === "--report-file") options.reportFile = argv[++index];
    else if (arg.startsWith("--report-file=")) {
      options.reportFile = arg.slice("--report-file=".length);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.all) {
    options.applyContent = true;
    options.media = true;
    options.approvePrep = true;
    options.setMediaType = true;
    options.goLive = true;
  }
  if (
    !options.applyContent &&
    !options.media &&
    !options.approvePrep &&
    !options.setMediaType &&
    !options.goLive
  ) {
    throw new Error(
      "Pass at least one of --apply-content --media --approve-prep --set-media-type --go-live (or --all)"
    );
  }
  return options;
}

function scrubAestheticTags(tags) {
  const cleaned = (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .filter((tag) => !ANIMATION_AESTHETIC_RE.test(tag));
  const unique = [...new Set(cleaned)];
  return unique.length ? unique : [...FALLBACK_AESTHETIC];
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadIds(idsFile) {
  const payload = JSON.parse(await fs.readFile(idsFile, "utf8"));
  return payload.ids;
}

async function applyContent(supabase, ids, contentFile) {
  const report = JSON.parse(await fs.readFile(contentFile, "utf8"));
  const byId = new Map((report.results ?? []).map((row) => [row.id, row]));
  const now = new Date().toISOString();
  let updated = 0;
  const missing = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.skipped || !row.synopsis) {
      missing.push(id);
      continue;
    }
    const patch = {
      synopsis: row.synopsis,
      the_mood: row.the_mood,
      technique: "live action",
      moods: row.moods ?? [],
      aesthetic_tags: scrubAestheticTags(row.aesthetic_tags),
      quick_filters: row.quick_filters ?? [],
      content_status: row.content_status ?? "ready_with_note",
      content_note: row.content_note ?? null,
      content_revision_count: row.content_revision_count ?? 1,
      content_updated_at: now,
      updated_at: now,
    };
    const { error } = await supabase
      .from("film_discovery_candidates")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    updated += 1;
  }

  return { updated, missing };
}

async function runMedia(supabase, ids) {
  if (process.env.WEEKLY_FILM_DISCOVERY_MEDIA_CONFIRM !== "1") {
    throw new Error(
      "Refusing media write. Set WEEKLY_FILM_DISCOVERY_MEDIA_CONFIRM=1"
    );
  }
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) throw new Error("TMDB_API_KEY required");

  const { data, error } = await supabase
    .from("film_discovery_candidates")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [row.id, row]));

  const tallies = { ok: 0, partial: 0, failed: 0, skipped: 0 };
  const details = [];

  for (const id of ids) {
    const candidate = byId.get(id);
    if (!candidate) {
      tallies.skipped += 1;
      details.push({ id, status: "missing" });
      continue;
    }
    const result = await curateDiscoveryMedia(candidate, {
      tmdbApiKey,
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      previousAttempts: candidate.media_attempts ?? 0,
    });
    if (result.skipped) {
      tallies.skipped += 1;
      details.push({ id, title: candidate.title, status: "skipped", reason: result.reason });
      continue;
    }
    const patch = buildMediaCandidatePatch(result, {
      previousAttempts: candidate.media_attempts ?? 0,
    });
    const { writes_to_films_table, publish, enrich_full, review_status_unchanged, identity_fields_unchanged, ...dbPatch } = patch;
    const { error: updateError } = await supabase
      .from("film_discovery_candidates")
      .update({ ...dbPatch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) throw updateError;
    const status = dbPatch.media_status;
    if (status === "complete" || status === "partial") tallies.ok += 1;
    else if (status === "failed") tallies.failed += 1;
    else tallies.partial += 1;
    details.push({
      id,
      title: candidate.title,
      media_status: status,
      hasPoster: Boolean(dbPatch.poster_url),
    });
  }

  return { tallies, details };
}

async function approveAndPrep(supabase, ids) {
  const { data, error } = await supabase
    .from("film_discovery_candidates")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [row.id, row]));

  const results = [];
  for (const id of ids) {
    const candidate = byId.get(id);
    if (!candidate) {
      results.push({ id, status: "missing" });
      continue;
    }

    if (candidate.review_status === DISCOVERY_REVIEW_STATUS.pendingReview) {
      const patch = buildApproveCandidatePatch(candidate);
      const {
        publish,
        enrich,
        insert_into_films,
        catalog_visible,
        ...dbPatch
      } = patch;
      const { error: approveError } = await supabase
        .from("film_discovery_candidates")
        .update(dbPatch)
        .eq("id", id)
        .eq("review_status", DISCOVERY_REVIEW_STATUS.pendingReview);
      if (approveError) throw approveError;
    }

    const { data: full, error: fullError } = await supabase
      .from("film_discovery_candidates")
      .select("*")
      .eq("id", id)
      .single();
    if (fullError) throw fullError;

    if (full.release_status === "released" && full.film_id) {
      results.push({
        id,
        title: full.title,
        status: "already_released",
        filmId: full.film_id,
      });
      continue;
    }

    let queueId = full.release_queue_id;
    if (!queueId || full.release_status === "blocked" || full.release_status === "not_queued") {
      const release = await enqueueDiscoveryCandidateForRelease(supabase, full, {
        replaceActive: true,
      });
      queueId = release.queueId;
      if (!queueId || release.status === "blocked") {
        results.push({
          id,
          title: full.title,
          status: "blocked",
          blockers: release.blockers,
        });
        continue;
      }
    }

    const prep = await runDiscoveryReleasePrepForQueueId(supabase, queueId);
    const { data: afterPrep } = await supabase
      .from("film_discovery_candidates")
      .select("id, title, release_status, film_id, release_blockers")
      .eq("id", id)
      .maybeSingle();

    results.push({
      id,
      title: full.title,
      status: afterPrep?.release_status ?? prep.queueUpdate?.status ?? "prepped",
      filmId: afterPrep?.film_id ?? null,
      queueId,
      blockers: afterPrep?.release_blockers ?? [],
    });
  }

  return results;
}

async function setLiveActionMediaType(supabase, ids) {
  const { data: candidates, error } = await supabase
    .from("film_discovery_candidates")
    .select("id, title, film_id")
    .in("id", ids);
  if (error) throw error;

  const filmIds = (candidates ?? [])
    .map((row) => row.film_id)
    .filter(Boolean);
  if (!filmIds.length) {
    return { updated: 0, filmIds: [] };
  }

  const { error: updateError } = await supabase
    .from("films")
    .update({ media_type: MEDIA_TYPE.liveAction })
    .in("id", filmIds);
  if (updateError) throw updateError;

  return { updated: filmIds.length, filmIds };
}

async function goLive(supabase, filmIds) {
  if (!filmIds.length) return { revealed: [] };
  return goLiveFilmBatch(supabase, filmIds, {
    actor: "la_tag_eval_release",
    notes: "LA tag eval early-access catalog",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const supabase = createSupabase();
  const ids = await loadIds(options.idsFile);
  const report = {
    ids: ids.length,
    idsFile: options.idsFile,
    contentFile: options.contentFile,
  };

  if (options.applyContent) {
    console.error(`Applying content+scrub to ${ids.length} candidates…`);
    report.applyContent = await applyContent(
      supabase,
      ids,
      options.contentFile
    );
    console.error(JSON.stringify(report.applyContent));
  }

  if (options.media) {
    console.error(`Running media curator for ${ids.length} candidates…`);
    report.media = await runMedia(supabase, ids);
    console.error(JSON.stringify(report.media.tallies));
  }

  if (options.approvePrep) {
    console.error(`Approve + enqueue + prep for ${ids.length} candidates…`);
    report.approvePrep = await approveAndPrep(supabase, ids);
    const filmIds = report.approvePrep
      .map((row) => row.filmId)
      .filter(Boolean);
    report.approvePrepSummary = {
      total: report.approvePrep.length,
      withFilmId: filmIds.length,
      blocked: report.approvePrep.filter((row) => row.status === "blocked").length,
    };
    console.error(JSON.stringify(report.approvePrepSummary));
  }

  let filmIdsForLive = [];
  if (options.setMediaType || options.goLive) {
    const { data: candidates } = await supabase
      .from("film_discovery_candidates")
      .select("film_id")
      .in("id", ids);
    filmIdsForLive = (candidates ?? [])
      .map((row) => row.film_id)
      .filter(Boolean);
  }

  if (options.setMediaType) {
    console.error(`Setting media_type=live_action on ${filmIdsForLive.length} films…`);
    report.setMediaType = await setLiveActionMediaType(supabase, ids);
    console.error(JSON.stringify(report.setMediaType));

    // Mandatory live-action axes: Visual World + Storytelling (AI fill + embeddings).
    const laFilmIds = report.setMediaType.filmIds ?? filmIdsForLive;
    if (laFilmIds.length) {
      console.error(
        `Enriching Visual World + Storytelling for ${laFilmIds.length} live-action films…`
      );
      const { processFilmBatch } = await import("./process-film-batch.mjs");
      report.laAxisEnrichment = await processFilmBatch({
        supabase,
        options: {
          filmIds: laFilmIds,
          dryRun: false,
          execute: true,
          skipMedia: true,
          rebuildAllProfiles: false,
        },
      });
    }
  }

  if (options.goLive) {
    console.error(`Go-live for ${filmIdsForLive.length} films…`);
    report.goLive = await goLive(supabase, filmIdsForLive);
    console.error(
      JSON.stringify({
        revealed: report.goLive?.revealed?.length ?? report.goLive?.filmIds?.length ?? null,
        keys: Object.keys(report.goLive ?? {}),
      })
    );
  }

  await fs.writeFile(options.reportFile, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        reportPath: options.reportFile,
        summary: {
          applyContent: report.applyContent ?? null,
          media: report.media?.tallies ?? null,
          approvePrep: report.approvePrepSummary ?? null,
          setMediaType: report.setMediaType ?? null,
          goLiveKeys: report.goLive ? Object.keys(report.goLive) : null,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
