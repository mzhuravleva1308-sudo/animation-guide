#!/usr/bin/env node
/**
 * Scrape Animafest Zagreb archive (2010–2026 by default).
 * Writes raw per-year JSON, feature dump, and discovery-minimal seed batches.
 *
 * Usage:
 *   node scripts/scrape-animafest-archive.mjs --from 2010 --to 2026
 *   node scripts/scrape-animafest-archive.mjs --from 2011 --to 2011 --force
 *
 * Output under tmp/animafest/:
 *   raw/{year}.json
 *   features.json
 *   seed/animafest-{year}.json
 *   seed/animafest-{from}-{to}.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES,
  ANIMAFEST_USER_AGENT,
  animafestFilmDetailUrl,
  animafestFilmsListUrl,
  animafestLiveFilmDetailUrl,
  animafestLiveFilmsListUrl,
  buildAnimafestCombinedSeedBatch,
  buildAnimafestSeedBatch,
  isAnimafestNotFoundPage,
  parseAnimafestFilmDetailPage,
  parseAnimafestFilmsListPage,
  parseAnimafestLiveFilmDetailPage,
  parseAnimafestLiveFilmsListPage,
  selectAnimafestFeatureSeedRows,
} from "../lib/festivals/animafest-archive-scrape.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "tmp", "animafest");

function parseArgs(argv) {
  const options = {
    from: 2010,
    to: 2026,
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
      "User-Agent": ANIMAFEST_USER_AGENT,
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
  if (isAnimafestNotFoundPage(html)) {
    return { ok: false, status: 404, html };
  }
  return { ok: true, status: response.status, html };
}

/**
 * @param {number} year
 * @param {number} delayMs
 */
async function scrapeYearFilmIndex(year, delayMs) {
  /** @type {Map<string, string>} */
  const bySlug = new Map();
  for (let page = 1; page <= 80; page += 1) {
    const url = animafestFilmsListUrl(year, page);
    let result;
    try {
      result = await fetchText(url);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }
    if (!result.ok) {
      if (page === 1) {
        return { ok: false, films: [], reason: "list_not_found" };
      }
      break;
    }
    const rows = parseAnimafestFilmsListPage(result.html);
    if (rows.length === 0) break;
    let added = 0;
    for (const row of rows) {
      if (!bySlug.has(row.slug)) {
        bySlug.set(row.slug, row.listTitle);
        added += 1;
      }
    }
    console.log(`  ${year} films page ${page}: +${added} (total ${bySlug.size})`);
    if (added === 0) break;
    await sleep(delayMs);
  }
  return {
    ok: true,
    films: [...bySlug.entries()].map(([slug, listTitle]) => ({
      slug,
      listTitle,
    })),
  };
}

/**
 * Current-site `/en/filmovi` catalogue (used when archive year is missing, e.g. 2026).
 * @param {number} festivalYear
 * @param {number} delayMs
 */
async function scrapeLiveFilmoviYear(festivalYear, delayMs) {
  /** @type {Map<string, { id: string, slug: string }>} */
  const byKey = new Map();
  let emptyStreak = 0;
  for (let page = 1; page <= 120; page += 1) {
    const url = animafestLiveFilmsListUrl(page);
    const result = await fetchText(url);
    if (!result.ok) break;
    const rows = parseAnimafestLiveFilmsListPage(result.html);
    let added = 0;
    for (const row of rows) {
      const key = `${row.id}/${row.slug}`;
      if (!byKey.has(key)) {
        byKey.set(key, row);
        added += 1;
      }
    }
    console.log(
      `  live filmovi page ${page}: +${added} (total ${byKey.size})`
    );
    if (added === 0) {
      emptyStreak += 1;
      if (emptyStreak >= 2) break;
    } else {
      emptyStreak = 0;
    }
    await sleep(delayMs);
  }

  const index = [...byKey.values()];
  /** @type {object[]} */
  const films = [];
  /** @type {{ slug: string, error: string }[]} */
  const errors = [];

  for (let i = 0; i < index.length; i += 1) {
    const { id, slug } = index[i];
    const sourceUrl = animafestLiveFilmDetailUrl(id, slug);
    try {
      const result = await fetchText(sourceUrl);
      if (!result.ok) {
        errors.push({ slug, error: `live_detail_not_found:${result.status}` });
      } else {
        films.push(
          parseAnimafestLiveFilmDetailPage(result.html, {
            festivalYear,
            id,
            slug,
            sourceUrl,
          })
        );
      }
    } catch (error) {
      errors.push({
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if ((i + 1) % 25 === 0 || i + 1 === index.length) {
      console.log(`  live ${festivalYear} details ${i + 1}/${index.length}`);
    }
    await sleep(delayMs);
  }

  return { films, errors };
}

/**
 * @param {number} year
 * @param {{ slug: string, listTitle: string }[]} index
 * @param {number} delayMs
 */
async function scrapeYearDetails(year, index, delayMs) {
  /** @type {object[]} */
  const films = [];
  /** @type {{ slug: string, error: string }[]} */
  const errors = [];

  for (let i = 0; i < index.length; i += 1) {
    const { slug, listTitle } = index[i];
    const sourceUrl = animafestFilmDetailUrl(year, slug);
    try {
      const result = await fetchText(sourceUrl);
      if (!result.ok) {
        errors.push({ slug, error: `detail_not_found:${result.status}` });
      } else {
        films.push(
          parseAnimafestFilmDetailPage(result.html, {
            festivalYear: year,
            slug,
            listTitle,
            sourceUrl,
          })
        );
      }
    } catch (error) {
      errors.push({
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if ((i + 1) % 25 === 0 || i + 1 === index.length) {
      console.log(`  ${year} details ${i + 1}/${index.length}`);
    }
    await sleep(delayMs);
  }

  return { films, errors };
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rawDir = path.join(options.outDir, "raw");
  const seedDir = path.join(options.outDir, "seed");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(seedDir, { recursive: true });

  console.log(
    `Animafest scrape ${options.from}–${options.to} → ${options.outDir} (feature ≥${ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES}m)`
  );

  /** @type {object} */
  const yearSummaries = {};

  for (let year = options.from; year <= options.to; year += 1) {
    const rawPath = path.join(rawDir, `${year}.json`);
    let yearPayload = options.force ? null : await readJsonIfExists(rawPath);

    if (yearPayload?.films?.length) {
      console.log(
        `== ${year}: resume raw (${yearPayload.films.length} films) ==`
      );
    } else {
      console.log(`== ${year}: fetch ==`);
      const index = await scrapeYearFilmIndex(year, options.delayMs);
      if (!index.ok) {
        console.warn(
          `  ${year}: archive list missing (${index.reason}) — trying live /en/filmovi`
        );
        const live = await scrapeLiveFilmoviYear(year, options.delayMs);
        yearPayload = {
          festival_year: year,
          scraped_at: new Date().toISOString(),
          ok: live.films.length > 0,
          reason: live.films.length > 0 ? "live_filmovi_fallback" : index.reason,
          source: "live_filmovi",
          film_count: live.films.length,
          error_count: live.errors.length,
          films: live.films,
          errors: live.errors,
        };
        if (live.films.length === 0) {
          console.warn(`  ${year}: live filmovi also empty`);
        }
      } else if (index.films.length === 0) {
        yearPayload = {
          festival_year: year,
          scraped_at: new Date().toISOString(),
          ok: false,
          reason: "empty_list",
          films: [],
          errors: [],
        };
        console.warn(`  ${year}: empty film list`);
      } else {
        const details = await scrapeYearDetails(
          year,
          index.films,
          options.delayMs
        );
        yearPayload = {
          festival_year: year,
          scraped_at: new Date().toISOString(),
          ok: true,
          film_count: details.films.length,
          error_count: details.errors.length,
          films: details.films,
          errors: details.errors,
        };
      }
      await writeJson(rawPath, yearPayload);
      console.log(`  wrote ${rawPath}`);
    }

    const films = Array.isArray(yearPayload.films) ? yearPayload.films : [];
    const featuresInYear = films.filter(
      (film) =>
        Number.isInteger(film.runtime_minutes) &&
        film.runtime_minutes >= ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES
    );
    yearSummaries[year] = {
      raw: films.length,
      features: featuresInYear.length,
      ok: yearPayload.ok !== false,
      reason: yearPayload.reason ?? null,
    };
  }

  // Rebuild features/seeds from every raw/{year}.json on disk so a partial
  // --from/--to re-scrape does not wipe other years.
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
            film.runtime_minutes >= ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES
        ).length,
        ok: payload?.ok !== false,
        reason: payload?.reason ?? null,
      };
    }
  }

  const featureRows = selectAnimafestFeatureSeedRows(allRawFilms);
  const rangeFrom = rawYears.length ? Math.min(...rawYears) : options.from;
  const rangeTo = rawYears.length ? Math.max(...rawYears) : options.to;
  const featuresPath = path.join(options.outDir, "features.json");
  await writeJson(featuresPath, {
    generated_at: new Date().toISOString(),
    from: rangeFrom,
    to: rangeTo,
    min_runtime_minutes: ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES,
    count: featureRows.length,
    films: featureRows,
  });
  console.log(`Features: ${featureRows.length} → ${featuresPath}`);

  for (const year of rawYears) {
    const batch = buildAnimafestSeedBatch(year, featureRows);
    if (batch.films.length === 0) continue;
    const seedPath = path.join(seedDir, `animafest-${year}.json`);
    await writeJson(seedPath, batch);
    console.log(`  seed ${batch.batch_name}: ${batch.films.length} → ${seedPath}`);
  }

  const combined = buildAnimafestCombinedSeedBatch(
    featureRows,
    `animafest-${rangeFrom}-${rangeTo}`
  );
  const combinedPath = path.join(
    seedDir,
    `animafest-${rangeFrom}-${rangeTo}.json`
  );
  if (combined.films.length > 0) {
    await writeJson(combinedPath, combined);
    console.log(
      `Combined seed: ${combined.films.length} → ${combinedPath}`
    );
  }

  try {
    await fs.unlink(path.join(seedDir, "animafest-2026-2026.json"));
  } catch {
    // optional leftover from a 2026-only rebuild
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
