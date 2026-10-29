#!/usr/bin/env node
/**
 * Scrape Annecy archive feature list pages (:lm, :lmcc), enrich via TMDB,
 * write discovery-minimal seed batches. Does not fetch film detail pages.
 *
 * Usage:
 *   node scripts/scrape-annecy-archive.mjs --from 2012 --to 2024
 *   node scripts/scrape-annecy-archive.mjs --from 2012 --to 2024 --force
 *
 * Output under tmp/annecy/:
 *   raw/{year}-{section}.json
 *   features-list.json
 *   features.json
 *   seed/annecy-{from}-{to}.json
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
  ANNECY_FEATURE_MIN_RUNTIME_MINUTES,
  ANNECY_FEATURE_SECTIONS,
  ANNECY_USER_AGENT,
  annecyOfficialSelectionListUrl,
  buildAnnecyCombinedSeedBatch,
  parseAnnecyFeatureListPage,
  selectAnnecyFeatureSeedRows,
} from "../lib/festivals/annecy-archive-scrape.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "tmp", "annecy");

/** Extra TMDB search queries when Annecy list title is local / romanized. */
const TITLE_ALIASES = {
  "voyage vers agartha": "Children Who Chase Lost Voices",
  "giovanni no shima": "Giovanni's Island",
  "jack et la mécanique du c?ur": "Jack and the Cuckoo-Clock Heart",
  "jack et la mecanique du coeur": "Jack and the Cuckoo-Clock Heart",
  "eun-sil-yee": "Eun-sil-yi",
  saibi: "The Fake",
  "sheep and wolves": "Sheep & Wolves",
  "ma famille afghane": "My Sunny Maad",
  rotzbub: "Snotty Boy",
  "goodbye, donglees!": "Goodbye, Don Glees!",
  "misaki no mayoiga": "The House of the Lost on the Cape",
};

function parseArgs(argv) {
  const options = {
    from: 2012,
    to: 2024,
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
 * @param {string} url
 */
async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": ANNECY_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  const html = await response.text();
  return { ok: response.ok, status: response.status, html };
}

/**
 * @param {object} match
 */
function countriesFromTmdb(match) {
  const rows = Array.isArray(match?.production_countries)
    ? match.production_countries
    : [];
  return [
    ...new Set(
      rows.map((row) => String(row?.name ?? "").trim()).filter(Boolean)
    ),
  ];
}

/**
 * @param {object} row
 * @param {object} match
 */
function mergeTmdbIntoRow(row, match) {
  const releaseYear = Number.parseInt(
    String(match.release_date ?? "").slice(0, 4),
    10
  );
  const runtime = Number.isInteger(match.runtime) ? match.runtime : null;
  const tmdbDirectors = Array.isArray(match.director_names)
    ? match.director_names.filter(Boolean)
    : [];
  const tmdbCountries = countriesFromTmdb(match);
  const tmdbTitle = String(match.title ?? "").trim();
  const tmdbOriginal =
    match.original_title &&
    normalizeFilmString(match.original_title) !==
      normalizeFilmString(tmdbTitle || row.title)
      ? String(match.original_title).trim()
      : null;

  const preferTmdbTitle =
    tmdbTitle &&
    (getTitleSimilarity(row.title, tmdbTitle) >= 70 ||
      (row.original_title &&
        getTitleSimilarity(row.original_title, tmdbTitle) >= 70));

  return {
    ...row,
    title: preferTmdbTitle ? tmdbTitle : row.title,
    year: Number.isInteger(releaseYear) ? releaseYear : row.year,
    runtime_minutes: runtime ?? row.runtime_minutes,
    directors:
      tmdbDirectors.length > 0 ? tmdbDirectors : row.directors ?? [],
    countries:
      tmdbCountries.length > 0 ? tmdbCountries : row.countries ?? [],
    original_title:
      tmdbOriginal &&
      normalizeFilmString(tmdbOriginal) !==
        normalizeFilmString(preferTmdbTitle ? tmdbTitle : row.title)
        ? tmdbOriginal
        : row.original_title ?? tmdbOriginal,
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
 * @param {object} row
 * @param {string} tmdbApiKey
 */
async function enrichRow(row, tmdbApiKey) {
  /** @type {string[]} */
  const queries = [];
  for (const q of [row.title, row.original_title]) {
    const cleaned = String(q ?? "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned && !queries.includes(cleaned)) queries.push(cleaned);
  }
  const alias =
    TITLE_ALIASES[String(row.title ?? "").trim().toLowerCase()] ??
    TITLE_ALIASES[normalizeFilmString(row.title ?? "")];
  if (alias && !queries.includes(alias)) queries.push(alias);

  /** @type {Map<number, object>} */
  const byId = new Map();
  for (const query of queries) {
    for (const yearHint of [
      null,
      row.festival_year - 1,
      row.festival_year,
    ]) {
      const results = await searchTmdbMovies(tmdbApiKey, query, yearHint);
      for (const result of results) {
        if (result?.id) byId.set(result.id, result);
      }
    }
  }

  if (byId.size === 0) {
    return {
      ...row,
      tmdb_id: null,
      tmdb_match_reason: "no_tmdb_match",
      enrich_ok: false,
    };
  }

  const titleHints = [row.title, row.original_title, alias].filter(Boolean);
  /** @type {{ score: number, match: object, reason: string }[]} */
  const scored = [];

  const candidateResults = [...byId.values()].sort((a, b) => {
    const yearA = Number.parseInt(String(a.release_date ?? "").slice(0, 4), 10);
    const yearB = Number.parseInt(String(b.release_date ?? "").slice(0, 4), 10);
    const dist = (y) =>
      Number.isInteger(y) ? Math.abs(y - (row.festival_year - 1)) : 999;
    return dist(yearA) - dist(yearB);
  });

  for (const result of candidateResults.slice(0, 15)) {
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
    // Allow older production years (restored classics / re-entries); reject only
    // matches that premiere after the festival edition.
    const yearOk =
      !Number.isInteger(releaseYear) || releaseYear <= row.festival_year + 1;
    const directorOverlap = (row.directors ?? []).some((dir) =>
      (merged.director_names ?? []).some(
        (name) => getTitleSimilarity(dir, name) >= 70
      )
    );

    let score = titleScore;
    if (isAnimation) score += 15;
    if (directorOverlap) score += 25;
    if (runtime >= ANNECY_FEATURE_MIN_RUNTIME_MINUTES) score += 10;
    if (Number.isInteger(releaseYear)) {
      const delta = Math.abs(releaseYear - (row.festival_year - 1));
      // Soft preference for near-festival production years; classics still ok.
      score += Math.max(0, 10 - Math.min(delta, 10));
    }
    if (!yearOk) score -= 40;
    // Common short titles (Pinocchio, Wall, …): require a director signal.
    const shortTitle = String(row.title ?? "").trim().length <= 12;
    if ((row.directors?.length ?? 0) > 0 && !directorOverlap && shortTitle) {
      continue;
    }

    scored.push({
      score,
      match: merged,
      reason: `title=${titleScore}; anim=${Boolean(isAnimation)}; dir=${directorOverlap}; y=${releaseYear}; rt=${runtime}`,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 70) {
    return {
      ...row,
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
  if (Number.isInteger(releaseYear) && releaseYear > row.festival_year + 1) {
    return {
      ...row,
      tmdb_id: best.match.id,
      tmdb_match_reason: `year_out_of_range_${releaseYear}`,
      enrich_ok: false,
    };
  }

  return {
    ...mergeTmdbIntoRow(row, best.match),
    tmdb_match_reason: best.reason,
    enrich_ok: true,
  };
}

/**
 * @param {number} from
 * @param {number} to
 */
function sectionsForRange(from, to) {
  /** @type {{ year: number, section: typeof ANNECY_FEATURE_SECTIONS[string] }[]} */
  const jobs = [];
  for (let year = from; year <= to; year += 1) {
    for (const section of Object.values(ANNECY_FEATURE_SECTIONS)) {
      if (year < section.fromYear) continue;
      jobs.push({ year, section });
    }
  }
  return jobs;
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const rawDir = path.join(options.outDir, "raw");
  const seedDir = path.join(options.outDir, "seed");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(seedDir, { recursive: true });

  const jobs = sectionsForRange(options.from, options.to);
  /** @type {object[]} */
  const allListRows = [];
  /** @type {Record<string, object>} */
  const yearSummaries = {};

  for (const { year, section } of jobs) {
    const rawPath = path.join(rawDir, `${year}-${section.code}.json`);
    let payload = options.force ? null : await readJsonIfExists(rawPath);
    const url = annecyOfficialSelectionListUrl(year, section.code);

    if (!payload) {
      console.log(`Fetching ${url}`);
      const fetched = await fetchText(url);
      if (!fetched.ok) {
        payload = {
          scraped_at: new Date().toISOString(),
          source_url: url,
          festival_year: year,
          section: section.code,
          ok: false,
          status: fetched.status,
          row_count: 0,
          rows: [],
        };
        console.warn(`  HTTP ${fetched.status} — skip`);
      } else {
        const rows = parseAnnecyFeatureListPage(fetched.html, {
          festivalYear: year,
          section: section.code,
          sectionLabel: section.label,
          sourceUrl: url,
        });
        payload = {
          scraped_at: new Date().toISOString(),
          source_url: url,
          festival_year: year,
          section: section.code,
          ok: true,
          status: fetched.status,
          row_count: rows.length,
          rows,
        };
        console.log(`  ${rows.length} films → ${rawPath}`);
      }
      await writeJson(rawPath, payload);
      await sleep(options.delayMs);
    } else {
      console.log(
        `Reusing ${rawPath} (${payload.row_count ?? payload.rows?.length ?? 0})`
      );
    }

    const key = `${year}-${section.code}`;
    yearSummaries[key] = {
      ok: payload.ok !== false,
      status: payload.status ?? null,
      count: Array.isArray(payload.rows) ? payload.rows.length : 0,
    };
    if (Array.isArray(payload.rows)) allListRows.push(...payload.rows);
  }

  console.log(`List rows total: ${allListRows.length}`);

  const tmdbApiKey =
    process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || "";
  if (!options.skipTmdb && !tmdbApiKey) {
    throw new Error("TMDB_API_KEY required (or pass --skip-tmdb)");
  }

  /** @type {object[]} */
  const enriched = [];
  for (const row of allListRows) {
    if (options.skipTmdb) {
      enriched.push({ ...row, enrich_ok: false, tmdb_match_reason: "skipped" });
      continue;
    }
    process.stdout.write(
      `  TMDB ${row.festival_year}/${row.section} ${row.title.slice(0, 40)}… `
    );
    const result = await enrichRow(row, tmdbApiKey);
    enriched.push(result);
    console.log(
      result.enrich_ok
        ? `ok y=${result.year} rt=${result.runtime_minutes}`
        : `fail (${result.tmdb_match_reason})`
    );
    await sleep(options.delayMs);
  }

  const listPath = path.join(options.outDir, "features-list.json");
  await writeJson(listPath, {
    generated_at: new Date().toISOString(),
    from: options.from,
    to: options.to,
    count: enriched.length,
    films: enriched,
  });

  const featureRows = selectAnnecyFeatureSeedRows(enriched);
  const skipped = enriched.filter(
    (row) =>
      !featureRows.some(
        (keep) =>
          normalizeFilmString(keep.title) === normalizeFilmString(row.title) &&
          keep.year === row.year
      )
  );

  const featuresPath = path.join(options.outDir, "features.json");
  await writeJson(featuresPath, {
    generated_at: new Date().toISOString(),
    from: options.from,
    to: options.to,
    min_runtime_minutes: ANNECY_FEATURE_MIN_RUNTIME_MINUTES,
    count: featureRows.length,
    skipped: skipped.map((row) => ({
      title: row.title,
      festival_year: row.festival_year,
      section: row.section,
      year: row.year,
      runtime_minutes: row.runtime_minutes,
      reason: row.tmdb_match_reason,
      enrich_ok: row.enrich_ok,
    })),
    films: featureRows,
  });
  console.log(
    `Features (≥${ANNECY_FEATURE_MIN_RUNTIME_MINUTES}m): ${featureRows.length} → ${featuresPath}`
  );
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`);
    for (const row of skipped.slice(0, 40)) {
      console.log(
        `  - ${row.festival_year}/${row.section} ${row.title} (${row.tmdb_match_reason}; rt=${row.runtime_minutes})`
      );
    }
    if (skipped.length > 40) console.log(`  … +${skipped.length - 40} more`);
  }

  const batchName = `annecy-${options.from}-${options.to}`;
  const combined = buildAnnecyCombinedSeedBatch(featureRows, batchName);
  const combinedPath = path.join(seedDir, `${batchName}.json`);
  if (combined.films.length > 0) {
    await writeJson(combinedPath, combined);
    console.log(`Combined seed: ${combined.films.length} → ${combinedPath}`);
  } else {
    console.warn("No seed films written");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        years: yearSummaries,
        list_count: allListRows.length,
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
