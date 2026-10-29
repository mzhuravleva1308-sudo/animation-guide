#!/usr/bin/env node
/**
 * Scrape ITFS Stuttgart archive feature films (langfilm) for 2025–2026.
 * Writes raw per-year JSON, feature dump, and discovery-minimal seed batches.
 *
 * Usage:
 *   node scripts/scrape-itfs-archive.mjs
 *   node scripts/scrape-itfs-archive.mjs --from 2025 --to 2026 --force
 *
 * Output under tmp/itfs/:
 *   raw/{year}.json
 *   features.json
 *   seed/itfs-{year}.json
 *   seed/itfs-{from}-{to}.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ITFS_EDITION_IDS,
  ITFS_FEATURE_MIN_RUNTIME_MINUTES,
  ITFS_USER_AGENT,
  buildItfsCombinedSeedBatch,
  buildItfsSeedBatch,
  itfsFilmDetailUrl,
  itfsLangfilmIndexUrl,
  mergeItfsListFallbacks,
  parseItfsFilmDetailPage,
  parseItfsFilmsListPage,
  selectItfsFeatureSeedRows,
} from "../lib/festivals/itfs-archive-scrape.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "tmp", "itfs");
const DEFAULT_YEARS = Object.keys(ITFS_EDITION_IDS)
  .map((y) => Number.parseInt(y, 10))
  .sort((a, b) => a - b);

function parseArgs(argv) {
  const options = {
    from: DEFAULT_YEARS[0],
    to: DEFAULT_YEARS[DEFAULT_YEARS.length - 1],
    outDir: DEFAULT_OUT_DIR,
    force: false,
    delayMs: 120,
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
  for (let year = options.from; year <= options.to; year += 1) {
    if (!ITFS_EDITION_IDS[year]) {
      throw new Error(
        `No ITFS edition id for ${year} (known: ${DEFAULT_YEARS.join(", ")})`
      );
    }
  }
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 */
async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": ITFS_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (response.status === 404) {
    return { ok: false, status: 404, html: "" };
  }
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return { ok: true, status: response.status, html };
}

/**
 * @param {string} filePath
 * @param {unknown} data
 */
async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * @param {string} filePath
 */
async function readJsonIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * @param {number[]} years
 * @param {number} delayMs
 */
async function scrapeIndex(years, delayMs) {
  const url = itfsLangfilmIndexUrl(years);
  console.log(`  index ${url}`);
  const result = await fetchText(url);
  if (!result.ok) {
    return { ok: false, rows: [], reason: `index_http_${result.status}` };
  }
  const rows = parseItfsFilmsListPage(result.html).filter((row) =>
    years.includes(row.festivalYear)
  );
  await sleep(delayMs);
  return { ok: true, rows, sourceUrl: url };
}

/**
 * @param {ReturnType<typeof parseItfsFilmsListPage>} indexRows
 * @param {number} delayMs
 */
async function scrapeDetails(indexRows, delayMs) {
  /** @type {object[]} */
  const films = [];
  /** @type {{ slug: string, festival_year: number | null, error: string }[]} */
  const errors = [];

  for (let i = 0; i < indexRows.length; i += 1) {
    const row = indexRows[i];
    const sourceUrl = row.sourceUrl || itfsFilmDetailUrl(row.slug);
    try {
      const result = await fetchText(sourceUrl);
      if (!result.ok) {
        errors.push({
          slug: row.slug,
          festival_year: row.festivalYear,
          error: `detail_not_found:${result.status}`,
        });
      } else if (!Number.isInteger(row.festivalYear)) {
        errors.push({
          slug: row.slug,
          festival_year: row.festivalYear,
          error: "missing_festival_year",
        });
      } else {
        const detail = parseItfsFilmDetailPage(result.html, {
          festivalYear: row.festivalYear,
          slug: row.slug,
          id: row.id,
          listTitle: row.listTitle,
          listOriginalTitle: row.originalTitle,
          sourceUrl,
        });
        films.push(
          mergeItfsListFallbacks(detail, {
            year: row.year,
            directors: row.directors,
            countries: row.countries,
            runtime_minutes: row.runtime_minutes,
            originalTitle: row.originalTitle,
          })
        );
      }
    } catch (error) {
      errors.push({
        slug: row.slug,
        festival_year: row.festivalYear,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if ((i + 1) % 10 === 0 || i + 1 === indexRows.length) {
      console.log(`  details ${i + 1}/${indexRows.length}`);
    }
    await sleep(delayMs);
  }

  return { films, errors };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const years = [];
  for (let year = options.from; year <= options.to; year += 1) {
    years.push(year);
  }

  const rawDir = path.join(options.outDir, "raw");
  const seedDir = path.join(options.outDir, "seed");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(seedDir, { recursive: true });

  console.log(
    `ITFS scrape ${options.from}–${options.to} → ${options.outDir} (feature ≥${ITFS_FEATURE_MIN_RUNTIME_MINUTES}m)`
  );

  const needFetch =
    options.force ||
    (
      await Promise.all(
        years.map(async (year) => {
          const existing = await readJsonIfExists(
            path.join(rawDir, `${year}.json`)
          );
          return !(existing?.films?.length > 0);
        })
      )
    ).some(Boolean);

  /** @type {object} */
  const yearSummaries = {};

  if (needFetch) {
    console.log("== fetch langfilm index ==");
    const index = await scrapeIndex(years, options.delayMs);
    if (!index.ok) {
      throw new Error(`ITFS index failed: ${index.reason}`);
    }
    console.log(`  index rows: ${index.rows.length}`);

    console.log("== fetch film details ==");
    const { films, errors } = await scrapeDetails(index.rows, options.delayMs);

    for (const year of years) {
      const yearFilms = films.filter((film) => film.festival_year === year);
      const yearErrors = errors.filter((err) => err.festival_year === year);
      const yearPayload = {
        festival_year: year,
        scraped_at: new Date().toISOString(),
        ok: true,
        edition_id: ITFS_EDITION_IDS[year],
        index_url: index.sourceUrl,
        film_count: yearFilms.length,
        error_count: yearErrors.length,
        films: yearFilms,
        errors: yearErrors,
      };
      const rawPath = path.join(rawDir, `${year}.json`);
      await writeJson(rawPath, yearPayload);
      console.log(`  wrote ${rawPath} (${yearFilms.length} films)`);
      yearSummaries[year] = {
        raw: yearFilms.length,
        features: yearFilms.filter(
          (film) =>
            Number.isInteger(film.runtime_minutes) &&
            film.runtime_minutes >= ITFS_FEATURE_MIN_RUNTIME_MINUTES
        ).length,
        ok: true,
        reason: null,
      };
    }
  } else {
    for (const year of years) {
      const payload = await readJsonIfExists(path.join(rawDir, `${year}.json`));
      console.log(
        `== ${year}: resume raw (${payload?.films?.length ?? 0} films) ==`
      );
    }
  }

  const rawFiles = (await fs.readdir(rawDir))
    .filter((name) => /^\d{4}\.json$/.test(name))
    .sort();
  /** @type {object[]} */
  const allRawFilms = [];
  /** @type {number[]} */
  const rawYears = [];
  for (const name of rawFiles) {
    const year = Number.parseInt(name.slice(0, 4), 10);
    const payload = await readJsonIfExists(path.join(rawDir, name));
    const films = Array.isArray(payload?.films) ? payload.films : [];
    allRawFilms.push(...films);
    rawYears.push(year);
    if (!(year in yearSummaries)) {
      yearSummaries[year] = {
        raw: films.length,
        features: films.filter(
          (film) =>
            Number.isInteger(film.runtime_minutes) &&
            film.runtime_minutes >= ITFS_FEATURE_MIN_RUNTIME_MINUTES
        ).length,
        ok: payload?.ok !== false,
        reason: payload?.reason ?? null,
      };
    }
  }

  const featureRows = selectItfsFeatureSeedRows(allRawFilms);
  const rangeFrom = rawYears.length ? Math.min(...rawYears) : options.from;
  const rangeTo = rawYears.length ? Math.max(...rawYears) : options.to;
  const featuresPath = path.join(options.outDir, "features.json");
  await writeJson(featuresPath, {
    generated_at: new Date().toISOString(),
    from: rangeFrom,
    to: rangeTo,
    min_runtime_minutes: ITFS_FEATURE_MIN_RUNTIME_MINUTES,
    count: featureRows.length,
    films: featureRows,
  });
  console.log(`Features: ${featureRows.length} → ${featuresPath}`);

  for (const year of rawYears) {
    const batch = buildItfsSeedBatch(year, featureRows);
    if (batch.films.length === 0) continue;
    const seedPath = path.join(seedDir, `itfs-${year}.json`);
    await writeJson(seedPath, batch);
    console.log(`  seed ${batch.batch_name}: ${batch.films.length} → ${seedPath}`);
  }

  const combined = buildItfsCombinedSeedBatch(
    featureRows,
    `itfs-${rangeFrom}-${rangeTo}`
  );
  const combinedPath = path.join(seedDir, `itfs-${rangeFrom}-${rangeTo}.json`);
  if (combined.films.length > 0) {
    await writeJson(combinedPath, combined);
    console.log(`Combined seed: ${combined.films.length} → ${combinedPath}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        years: yearSummaries,
        feature_count: featureRows.length,
        out_dir: options.outDir,
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
