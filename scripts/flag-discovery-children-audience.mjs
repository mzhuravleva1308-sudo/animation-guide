#!/usr/bin/env node
/**
 * Flag primarily-for-children discovery candidates for careful review.
 * Sets review_flags += primarily_for_children. Does not reject or change review_status.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/flag-discovery-children-audience.mjs --review-status pending_review --dry-run
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/flag-discovery-children-audience.mjs --review-status pending_review --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { normalizeFilmString } from "../lib/film-duplicate-check.mjs";
import {
  assessDiscoveryChildrenAudience,
  buildPrimarilyForChildrenFlagPatch,
  discoveryRowPrimarilyForChildren,
} from "../lib/film-discovery-children-audience.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    reviewStatus: "pending_review",
    source: null,
    write: false,
    force: false,
    featuresPath: path.join(ROOT, "tmp/animafest/features.json"),
    out: null,
    withTmdb: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--review-status") options.reviewStatus = argv[++i];
    else if (arg.startsWith("--review-status=")) {
      options.reviewStatus = arg.slice("--review-status=".length);
    } else if (arg === "--source") options.source = argv[++i];
    else if (arg.startsWith("--source=")) options.source = arg.slice(9);
    else if (arg === "--write") options.write = true;
    else if (arg === "--dry-run") options.write = false;
    else if (arg === "--force") options.force = true;
    else if (arg === "--no-tmdb") options.withTmdb = false;
    else if (arg === "--features") options.featuresPath = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/**
 * @param {string} featuresPath
 */
function loadFestivalSections(featuresPath) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!fs.existsSync(featuresPath)) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(featuresPath, "utf8"));
    const films = Array.isArray(raw) ? raw : raw.films ?? [];
    for (const film of films) {
      if (!film?.title || film.year == null) continue;
      const key = `${normalizeFilmString(film.title)}:${film.year}`;
      if (film.section) map.set(key, String(film.section));
    }
  } catch {
    // optional enrichment
  }
  return map;
}

/**
 * @param {string} apiKey
 * @param {{ title: string, year: number }} film
 */
async function fetchTmdbGenres(apiKey, film) {
  const search = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(film.title)}&year=${film.year}`
  );
  if (!search.ok) return [];
  const body = await search.json();
  const hit =
    (body.results ?? []).find(
      (row) =>
        String(row.title ?? "").toLowerCase() === film.title.toLowerCase()
    ) ?? (body.results ?? [])[0];
  if (!hit?.id) return [];
  const detail = await fetch(
    `https://api.themoviedb.org/3/movie/${hit.id}?api_key=${apiKey}`
  );
  if (!detail.ok) return [];
  const movie = await detail.json();
  return (movie.genres ?? []).map((genre) => String(genre.name));
}

async function main() {
  applyAppEnv({ mode: "hosted" });
  const options = parseArgs(process.argv.slice(2));

  if (options.write && process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 --write"
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tmdbKey = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!url || !key) throw new Error("Supabase env required");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sections = loadFestivalSections(options.featuresPath);

  let query = supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, year, synopsis, the_mood, content_note, eligibility_evidence, festival_claims, review_status, source"
    )
    .order("title", { ascending: true });
  if (options.reviewStatus) {
    query = query.eq("review_status", options.reviewStatus);
  }
  if (options.source) query = query.eq("source", options.source);

  const { data, error } = await query;
  if (error) throw error;

  /** @type {object[]} */
  const results = [];
  let updated = 0;

  for (const row of data ?? []) {
    if (!options.force && discoveryRowPrimarilyForChildren(row)) {
      results.push({
        id: row.id,
        title: row.title,
        year: row.year,
        skipped: true,
        reason: "already_flagged",
      });
      continue;
    }

    const key = `${normalizeFilmString(row.title)}:${row.year}`;
    const sectionFromClaims = Array.isArray(row.festival_claims)
      ? row.festival_claims.find((claim) => claim?.section)?.section
      : null;
    const festivalSection = sections.get(key) ?? sectionFromClaims ?? null;

    let tmdbGenres = [];
    if (options.withTmdb && tmdbKey) {
      try {
        tmdbGenres = await fetchTmdbGenres(tmdbKey, row);
      } catch {
        tmdbGenres = [];
      }
    }

    const assessment = assessDiscoveryChildrenAudience({
      title: row.title,
      synopsis: row.synopsis,
      the_mood: row.the_mood,
      content_note: row.content_note,
      festival_section: festivalSection,
      tmdb_genres: tmdbGenres,
    });

    if (!assessment.primarily_for_children) {
      results.push({
        id: row.id,
        title: row.title,
        year: row.year,
        flagged: false,
        assessment,
      });
      continue;
    }

    const flagPatch = buildPrimarilyForChildrenFlagPatch(row);
    let wrote = false;
    if (options.write) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({
          eligibility_evidence: flagPatch.eligibility_evidence,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
      wrote = true;
      updated += 1;
    }

    console.error(
      `[flag] ${row.title} (${row.year}) · ${assessment.confidence} · ${assessment.reasons.join("; ")}`
    );
    results.push({
      id: row.id,
      title: row.title,
      year: row.year,
      flagged: true,
      wrote,
      assessment,
      review_flags: flagPatch.review_flags,
    });
  }

  const report = {
    dry_run: !options.write,
    write: options.write,
    review_status: options.reviewStatus,
    candidates_scanned: (data ?? []).length,
    flagged: results.filter((row) => row.flagged).length,
    candidates_updated: updated,
    results,
  };
  const outPath =
    options.out ||
    path.join(
      ROOT,
      "tmp",
      options.write
        ? `discovery-children-flags-write-${report.flagged}.json`
        : `discovery-children-flags-dry-run-${report.flagged}.json`
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        out: outPath,
        scanned: report.candidates_scanned,
        flagged: report.flagged,
        candidates_updated: updated,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
