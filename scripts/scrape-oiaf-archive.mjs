#!/usr/bin/env node
/**
 * Scrape OIAF /archive/ award table for feature winners, enrich via TMDB,
 * write discovery-minimal seed batches.
 *
 * Usage:
 *   node scripts/scrape-oiaf-archive.mjs --from 2012
 *   node scripts/scrape-oiaf-archive.mjs --from 2012 --to 2021 --force
 *
 * Output under tmp/oiaf/:
 *   raw/archive-table.json
 *   features-awards.json   (award rows before/after enrich)
 *   features.json          (runtime >= 40, seed-ready)
 *   seed/oiaf-{from}-{to}.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAppEnv } from "./load-app-env.mjs";
import { normalizeFilmString } from "../lib/film-duplicate-check.mjs";
import {
  TMDB_ANIMATION_GENRE_ID,
  fetchTmdbMovieDetails,
  getTitleSimilarity,
} from "../lib/tmdb-film-matching.mjs";
import {
  OIAF_ARCHIVE_URL,
  OIAF_FEATURE_MIN_RUNTIME_MINUTES,
  OIAF_USER_AGENT,
  buildOiafCombinedSeedBatch,
  parseOiafArchiveTable,
  selectOiafFeatureAwardRows,
  selectOiafFeatureSeedRows,
} from "../lib/festivals/oiaf-archive-scrape.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "tmp", "oiaf");

function parseArgs(argv) {
  const options = {
    from: 2012,
    to: 2021,
    outDir: DEFAULT_OUT_DIR,
    force: false,
    skipTmdb: false,
    delayMs: 200,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--from") options.from = Number.parseInt(argv[++i], 10);
    else if (arg.startsWith("--from="))
      options.from = Number.parseInt(arg.slice("--from=".length), 10);
    else if (arg === "--to") options.to = Number.parseInt(argv[++i], 10);
    else if (arg.startsWith("--to="))
      options.to = Number.parseInt(arg.slice("--to=".length), 10);
    else if (arg === "--out") options.outDir = path.resolve(argv[++i]);
    else if (arg.startsWith("--out="))
      options.outDir = path.resolve(arg.slice("--out=".length));
    else if (arg === "--force") options.force = true;
    else if (arg === "--skip-tmdb") options.skipTmdb = true;
    else if (arg === "--delay-ms")
      options.delayMs = Number.parseInt(argv[++i], 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.from) || !Number.isInteger(options.to)) {
    throw new Error("--from and --to must be integers");
  }
  if (options.from > options.to) {
    throw new Error("--from must be <= --to");
  }
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Map TMDB production_countries to English names when present.
 * @param {object} match
 */
function countriesFromTmdb(match) {
  const rows = Array.isArray(match?.production_countries)
    ? match.production_countries
    : [];
  return [
    ...new Set(
      rows
        .map((row) => String(row?.name ?? "").trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * @param {object} awardRow
 * @param {object} match
 */
function mergeTmdbIntoAwardRow(awardRow, match) {
  const releaseYear = Number.parseInt(
    String(match.release_date ?? "").slice(0, 4),
    10
  );
  const runtime = Number.isInteger(match.runtime) ? match.runtime : null;
  const tmdbDirectors = Array.isArray(match.director_names)
    ? match.director_names.filter(Boolean)
    : [];
  const tmdbCountries = countriesFromTmdb(match);
  const tmdbOriginal =
    match.original_title &&
    normalizeFilmString(match.original_title) !==
      normalizeFilmString(match.title ?? awardRow.title)
      ? String(match.original_title).trim()
      : null;

  // Prefer TMDB English/display title when OIAF used a local/all-caps form.
  const tmdbTitle = String(match.title ?? "").trim();
  const preferTmdbTitle =
    tmdbTitle &&
    (awardRow.title === awardRow.title.toUpperCase() ||
      getTitleSimilarity(awardRow.title, tmdbTitle) >= 70 ||
      (awardRow.original_title &&
        getTitleSimilarity(awardRow.original_title, tmdbTitle) >= 70));

  return {
    ...awardRow,
    title: preferTmdbTitle ? tmdbTitle : awardRow.title,
    year: Number.isInteger(releaseYear) ? releaseYear : awardRow.year,
    runtime_minutes: runtime ?? awardRow.runtime_minutes,
    directors:
      tmdbDirectors.length > 0 ? tmdbDirectors : awardRow.directors ?? [],
    countries:
      tmdbCountries.length > 0 ? tmdbCountries : awardRow.countries ?? [],
    original_title:
      tmdbOriginal &&
      normalizeFilmString(tmdbOriginal) !==
        normalizeFilmString(preferTmdbTitle ? tmdbTitle : awardRow.title)
        ? tmdbOriginal
        : awardRow.original_title ?? tmdbOriginal,
    tmdb_id: match.id ?? null,
    tmdb_title: tmdbTitle || null,
  };
}

/**
 * @param {string} tmdbApiKey
 * @param {string} query
 * @param {number | null} year
 */
async function searchTmdbMovies(tmdbApiKey, query, year = null) {
  const params = new URLSearchParams({
    api_key: tmdbApiKey,
    query,
    include_adult: "false",
  });
  if (Number.isInteger(year)) params.set("year", String(year));
  const response = await fetch(
    `https://api.themoviedb.org/3/search/movie?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Looser festival enricher: title similarity + year near festival + animation.
 * @param {object} awardRow
 * @param {string} tmdbApiKey
 */
async function enrichAwardRow(awardRow, tmdbApiKey) {
  /** @type {string[]} */
  const queries = [];
  for (const q of [
    awardRow.title,
    awardRow.original_title,
    awardRow.raw_title,
  ]) {
    const cleaned = String(q ?? "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/,\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned && !queries.includes(cleaned)) queries.push(cleaned);
    // Also try parenthetical alternate alone
    const paren = String(q ?? "").match(/\(([^)]+)\)/);
    if (paren) {
      const inner = paren[1].trim();
      if (inner && !queries.includes(inner)) queries.push(inner);
    }
  }

  /** @type {Map<number, object>} */
  const byId = new Map();
  for (const query of queries) {
    for (const yearHint of [null, awardRow.festival_year - 1, awardRow.festival_year]) {
      const results = await searchTmdbMovies(tmdbApiKey, query, yearHint);
      for (const result of results) {
        if (result?.id) byId.set(result.id, result);
      }
    }
  }

  if (byId.size === 0) {
    return {
      ...awardRow,
      tmdb_id: null,
      tmdb_match_reason: "no_tmdb_match",
      enrich_ok: false,
    };
  }

  const titleHints = [awardRow.title, awardRow.original_title].filter(Boolean);
  /** @type {{ score: number, match: object, reason: string }[]} */
  const scored = [];

  for (const result of [...byId.values()].slice(0, 12)) {
    const details = await fetchTmdbMovieDetails(
      tmdbApiKey,
      result.id,
      "credits"
    );
    const merged = { ...result, ...details };
    const releaseYear = Number.parseInt(
      String(merged.release_date ?? "").slice(0, 4),
      10
    );
    const titleScore = Math.max(
      0,
      ...titleHints.map((hint) =>
        Math.max(
          getTitleSimilarity(hint, merged.title),
          getTitleSimilarity(hint, merged.original_title)
        )
      )
    );
    const isAnimation =
      merged.genre_ids?.includes(TMDB_ANIMATION_GENRE_ID) ||
      merged.genres?.some((genre) => genre.id === TMDB_ANIMATION_GENRE_ID);
    const runtime = Number.isInteger(merged.runtime) ? merged.runtime : 0;
    const yearOk =
      !Number.isInteger(releaseYear) ||
      (releaseYear >= awardRow.festival_year - 6 &&
        releaseYear <= awardRow.festival_year + 1);

    const directorOverlap = (awardRow.directors ?? []).some((dir) =>
      (merged.director_names ?? []).some(
        (name) => getTitleSimilarity(dir, name) >= 80
      )
    );

    let score = titleScore;
    if (isAnimation) score += 15;
    if (directorOverlap) score += 20;
    if (runtime >= OIAF_FEATURE_MIN_RUNTIME_MINUTES) score += 10;
    if (Number.isInteger(releaseYear)) {
      const delta = Math.abs(releaseYear - (awardRow.festival_year - 1));
      score += Math.max(0, 10 - delta * 2);
    }
    if (!yearOk) score -= 40;

    scored.push({
      score,
      match: merged,
      reason: `title=${titleScore}; anim=${Boolean(isAnimation)}; dir=${directorOverlap}; y=${releaseYear}; rt=${runtime}`,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 75) {
    return {
      ...awardRow,
      tmdb_id: best?.match?.id ?? null,
      tmdb_match_reason: best
        ? `low_score_${best.score}(${best.reason})`
        : "no_tmdb_match",
      enrich_ok: false,
    };
  }

  const releaseYear = Number.parseInt(
    String(best.match.release_date ?? "").slice(0, 4),
    10
  );
  if (
    Number.isInteger(releaseYear) &&
    (releaseYear < awardRow.festival_year - 6 ||
      releaseYear > awardRow.festival_year + 1)
  ) {
    return {
      ...awardRow,
      tmdb_id: best.match.id,
      tmdb_match_reason: `year_out_of_range_${releaseYear}`,
      enrich_ok: false,
    };
  }

  return {
    ...mergeTmdbIntoAwardRow(awardRow, best.match),
    tmdb_match_reason: best.reason,
    enrich_ok: true,
  };
}
async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const rawDir = path.join(options.outDir, "raw");
  const seedDir = path.join(options.outDir, "seed");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(seedDir, { recursive: true });

  const rawPath = path.join(rawDir, "archive-table.json");
  let rawPayload = options.force ? null : await readJsonIfExists(rawPath);

  if (!rawPayload) {
    console.log(`Fetching ${OIAF_ARCHIVE_URL}`);
    const response = await fetch(OIAF_ARCHIVE_URL, {
      headers: {
        "User-Agent": OIAF_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${OIAF_ARCHIVE_URL}`);
    }
    const html = await response.text();
    const rows = parseOiafArchiveTable(html);
    rawPayload = {
      scraped_at: new Date().toISOString(),
      source_url: OIAF_ARCHIVE_URL,
      row_count: rows.length,
      rows,
    };
    await writeJson(rawPath, rawPayload);
    console.log(`  wrote ${rawPath} (${rows.length} rows)`);
  } else {
    console.log(
      `Reusing ${rawPath} (${rawPayload.row_count ?? rawPayload.rows?.length} rows)`
    );
  }

  const awardRows = selectOiafFeatureAwardRows(
    rawPayload.rows ?? [],
    options.from,
    options.to
  );
  console.log(
    `Feature award rows ${options.from}–${options.to}: ${awardRows.length}`
  );

  const tmdbApiKey =
    process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || "";
  if (!options.skipTmdb && !tmdbApiKey) {
    throw new Error("TMDB_API_KEY required (or pass --skip-tmdb)");
  }

  /** @type {object[]} */
  const enriched = [];
  for (const row of awardRows) {
    if (options.skipTmdb) {
      enriched.push({ ...row, enrich_ok: false, tmdb_match_reason: "skipped" });
      continue;
    }
    process.stdout.write(
      `  TMDB ${row.festival_year} ${row.title.slice(0, 48)}… `
    );
    const result = await enrichAwardRow(row, tmdbApiKey);
    enriched.push(result);
    console.log(
      result.enrich_ok
        ? `ok y=${result.year} rt=${result.runtime_minutes}`
        : `fail (${result.tmdb_match_reason})`
    );
    await sleep(options.delayMs);
  }

  const awardsPath = path.join(options.outDir, "features-awards.json");
  await writeJson(awardsPath, {
    generated_at: new Date().toISOString(),
    from: options.from,
    to: options.to,
    count: enriched.length,
    films: enriched,
  });

  const featureRows = selectOiafFeatureSeedRows(enriched);
  const skipped = enriched.filter(
    (row) =>
      !featureRows.some(
        (keep) =>
          normalizeFilmString(keep.title) === normalizeFilmString(row.title)
      )
  );

  const featuresPath = path.join(options.outDir, "features.json");
  await writeJson(featuresPath, {
    generated_at: new Date().toISOString(),
    from: options.from,
    to: options.to,
    min_runtime_minutes: OIAF_FEATURE_MIN_RUNTIME_MINUTES,
    count: featureRows.length,
    skipped: skipped.map((row) => ({
      title: row.title,
      festival_year: row.festival_year,
      award: row.award,
      year: row.year,
      runtime_minutes: row.runtime_minutes,
      reason: row.tmdb_match_reason,
      enrich_ok: row.enrich_ok,
    })),
    films: featureRows,
  });
  console.log(`Features (≥${OIAF_FEATURE_MIN_RUNTIME_MINUTES}m): ${featureRows.length} → ${featuresPath}`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`);
    for (const row of skipped) {
      console.log(
        `  - ${row.festival_year} ${row.title} (${row.tmdb_match_reason}; rt=${row.runtime_minutes})`
      );
    }
  }

  const batchName = `oiaf-${options.from}-${options.to}`;
  const combined = buildOiafCombinedSeedBatch(featureRows, batchName);
  const combinedPath = path.join(seedDir, `${batchName}.json`);
  if (combined.films.length > 0) {
    await writeJson(combinedPath, combined);
    console.log(`Combined seed: ${combined.films.length} → ${combinedPath}`);
  } else {
    console.warn("No seed films written (empty after runtime filter)");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        award_count: awardRows.length,
        feature_count: featureRows.length,
        skipped_count: skipped.length,
        seed: combined.films.length ? combinedPath : null,
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
