/**
 * One-shot hosted catalog dump of TMDB watch/providers (JustWatch-backed).
 * Read-only: does not write to the database.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/audit-tmdb-watch-providers.mjs
 *   APP_ENV=hosted node scripts/audit-tmdb-watch-providers.mjs --regions=US,FR,DE,GB,PL
 *   APP_ENV=hosted node scripts/audit-tmdb-watch-providers.mjs --limit=50
 *   APP_ENV=hosted node scripts/audit-tmdb-watch-providers.mjs --visible-only
 *   APP_ENV=hosted node scripts/audit-tmdb-watch-providers.mjs --visible-only --resolve-tmdb
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  TMDB_ANIMATION_GENRE_ID,
  evaluateTmdbMatch,
  getTitleSimilarity,
  getYearDifference,
} from "../lib/tmdb-film-matching.mjs";
import { applyAppEnv } from "./load-app-env.mjs";

applyAppEnv();

const DEFAULT_REGIONS = ["US", "FR", "DE", "GB", "PL"];
const CONCURRENCY = 6;

function parseArgs(argv) {
  const regionsArg = argv.find((a) => a.startsWith("--regions="));
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const outArg = argv.find((a) => a.startsWith("--out="));
  return {
    regions: regionsArg
      ? regionsArg
          .slice("--regions=".length)
          .split(",")
          .map((r) => r.trim().toUpperCase())
          .filter(Boolean)
      : DEFAULT_REGIONS,
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    visibleOnly: argv.includes("--visible-only"),
    resolveTmdb: argv.includes("--resolve-tmdb"),
    outPath:
      outArg?.slice("--out=".length) ??
      path.join("tmp", `tmdb-watch-providers-${stamp()}.json`),
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function loadFilms(supabase, { visibleOnly, limit }) {
  const pageSize = 1000;
  const films = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("films")
      .select(
        "id, title, original_title, director, year, country, media_type, catalog_visible, tmdb_id, availability, synopsis"
      )
      .order("title")
      .range(from, from + pageSize - 1);
    if (visibleOnly) {
      query = query.eq("catalog_visible", true);
    }
    const { data, error } = await query;
    if (error) throw error;
    films.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  if (limit != null && Number.isFinite(limit) && limit > 0) {
    return films.slice(0, limit);
  }
  return films;
}

async function searchTmdbMovies(apiKey, film) {
  const queries = [film.title, film.original_title]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const allResults = [];

  for (const query of [...new Set(queries)]) {
    const params = new URLSearchParams({
      api_key: apiKey,
      query,
      include_adult: "false",
    });
    if (film.year) {
      params.set("year", String(film.year));
    }
    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?${params.toString()}`
    );
    if (!response.ok) {
      throw new Error(`TMDB search "${query}": ${response.status}`);
    }
    const data = await response.json();
    allResults.push(...(data.results ?? []));
  }

  return Array.from(
    new Map(allResults.map((result) => [result.id, result])).values()
  );
}

/**
 * Lightweight audit match: reuse evaluateTmdbMatch when search payload is enough,
 * else accept strong title+year (and prefer animation genre for animation rows).
 */
function pickTmdbMatch(film, results) {
  if (!results.length) {
    return { tmdbId: null, matchStatus: "no_search_hits", matchedTitle: null };
  }

  const scored = results.map((result) => {
    const evaluation = evaluateTmdbMatch(film, result);
    const titleSimilarity = Math.max(
      getTitleSimilarity(film.title, result.title),
      getTitleSimilarity(film.title, result.original_title),
      getTitleSimilarity(film.original_title, result.title),
      getTitleSimilarity(film.original_title, result.original_title)
    );
    const yearDifference = getYearDifference(film, result);
    const isAnimation = (result.genre_ids ?? []).includes(TMDB_ANIMATION_GENRE_ID);
    const mediaPrefersAnimation = film.media_type !== "live_action";
    let score = titleSimilarity;
    if (yearDifference === 0) score += 25;
    else if (yearDifference === 1) score += 12;
    else if (yearDifference != null && yearDifference > 2) score -= 40;
    if (evaluation.accepted) score += 30;
    if (mediaPrefersAnimation && isAnimation) score += 10;
    if (!mediaPrefersAnimation && !isAnimation) score += 5;
    return { result, evaluation, titleSimilarity, yearDifference, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  const looseAccept =
    best.titleSimilarity >= 85 &&
    best.yearDifference != null &&
    best.yearDifference <= 1;

  if (best.evaluation.accepted || looseAccept) {
    return {
      tmdbId: best.result.id,
      matchStatus: best.evaluation.accepted
        ? "matched_strict"
        : "matched_title_year",
      matchedTitle: best.result.title,
      matchedYear: String(best.result.release_date ?? "").slice(0, 4) || null,
    };
  }

  return {
    tmdbId: null,
    matchStatus: "no_confident_match",
    matchedTitle: best.result.title,
    matchedYear: String(best.result.release_date ?? "").slice(0, 4) || null,
    reason: best.evaluation.reason,
  };
}

async function resolveTmdbId(apiKey, film) {
  if (film.tmdb_id != null) {
    return {
      tmdbId: film.tmdb_id,
      matchStatus: "stored",
      matchedTitle: null,
      matchedYear: null,
    };
  }
  const results = await searchTmdbMovies(apiKey, film);
  return pickTmdbMatch(film, results);
}

function summarizeRegion(entry) {
  if (!entry) return null;
  const buckets = ["flatrate", "rent", "buy", "free", "ads"];
  const providers = {};
  let total = 0;
  for (const bucket of buckets) {
    const list = Array.isArray(entry[bucket]) ? entry[bucket] : [];
    providers[bucket] = list.map((p) => p.provider_name).filter(Boolean);
    total += providers[bucket].length;
  }
  return {
    link: entry.link ?? null,
    total,
    hasStream: providers.flatrate.length > 0 || providers.ads.length > 0 || providers.free.length > 0,
    hasRentOrBuy: providers.rent.length > 0 || providers.buy.length > 0,
    providers,
  };
}

async function fetchWatchProviders(apiKey, tmdbId) {
  const url = new URL(
    `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers`
  );
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url);
  if (response.status === 404) {
    return { ok: false, status: 404, results: {} };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `TMDB watch/providers ${tmdbId}: ${response.status} ${text.slice(0, 120)}`
    );
  }
  const data = await response.json();
  return { ok: true, status: response.status, results: data.results ?? {} };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

function emptyRegionStats(regions) {
  return Object.fromEntries(
    regions.map((r) => [
      r,
      {
        withAny: 0,
        withStream: 0,
        withRentOrBuyOnly: 0,
        empty: 0,
        topStream: new Map(),
      },
    ])
  );
}

function bumpProviderCounts(map, names) {
  for (const name of names) {
    map.set(name, (map.get(name) ?? 0) + 1);
  }
}

function topFromMap(map, n = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tmdbApiKey =
    process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL / service role (use APP_ENV=hosted)");
  }
  if (!tmdbApiKey) {
    throw new Error("Missing TMDB_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const films = await loadFilms(supabase, options);
  const storedTmdb = films.filter((f) => f.tmdb_id != null).length;

  console.log(
    `Films loaded: ${films.length} (stored tmdb_id: ${storedTmdb}); resolve=${options.resolveTmdb}; regions: ${options.regions.join(",")}`
  );

  const regionStats = emptyRegionStats(options.regions);
  let anyRegionHit = 0;
  let allSampleRegionsEmpty = 0;
  let fetchErrors = 0;
  let resolvedCount = 0;
  let unresolvedCount = 0;
  const matchStatusCounts = new Map();

  const rows = await mapPool(films, CONCURRENCY, async (film, index) => {
    if (index > 0 && index % 50 === 0) {
      console.log(`… ${index}/${films.length}`);
    }
    try {
      let resolved;
      if (film.tmdb_id != null) {
        resolved = {
          tmdbId: film.tmdb_id,
          matchStatus: "stored",
          matchedTitle: null,
          matchedYear: null,
        };
      } else if (options.resolveTmdb) {
        resolved = await resolveTmdbId(tmdbApiKey, film);
      } else {
        resolved = {
          tmdbId: null,
          matchStatus: "skipped_no_stored_id",
          matchedTitle: null,
          matchedYear: null,
        };
      }

      matchStatusCounts.set(
        resolved.matchStatus,
        (matchStatusCounts.get(resolved.matchStatus) ?? 0) + 1
      );

      if (resolved.tmdbId == null) {
        unresolvedCount += 1;
        return {
          id: film.id,
          title: film.title,
          year: film.year,
          country: film.country,
          media_type: film.media_type,
          catalog_visible: film.catalog_visible,
          tmdb_id: null,
          tmdb_match_status: resolved.matchStatus,
          tmdb_matched_title: resolved.matchedTitle,
          availability: film.availability,
          tmdb_regions_total: 0,
          regions: {},
          error: null,
        };
      }

      resolvedCount += 1;
      const payload = await fetchWatchProviders(tmdbApiKey, resolved.tmdbId);
      const byRegion = {};
      let hitAnywhereInSample = false;
      for (const region of options.regions) {
        const summary = summarizeRegion(payload.results?.[region]);
        byRegion[region] = summary;
        const stats = regionStats[region];
        if (!summary || summary.total === 0) {
          stats.empty += 1;
        } else {
          hitAnywhereInSample = true;
          stats.withAny += 1;
          if (summary.hasStream) {
            stats.withStream += 1;
            bumpProviderCounts(stats.topStream, summary.providers.flatrate);
            bumpProviderCounts(stats.topStream, summary.providers.free);
            bumpProviderCounts(stats.topStream, summary.providers.ads);
          } else if (summary.hasRentOrBuy) {
            stats.withRentOrBuyOnly += 1;
          }
        }
      }
      const allRegionsCount = Object.keys(payload.results ?? {}).length;
      if (hitAnywhereInSample) anyRegionHit += 1;
      else allSampleRegionsEmpty += 1;

      return {
        id: film.id,
        title: film.title,
        year: film.year,
        country: film.country,
        media_type: film.media_type,
        catalog_visible: film.catalog_visible,
        tmdb_id: resolved.tmdbId,
        tmdb_match_status: resolved.matchStatus,
        tmdb_matched_title: resolved.matchedTitle,
        availability: film.availability,
        tmdb_regions_total: allRegionsCount,
        regions: byRegion,
        error: payload.ok ? null : `http_${payload.status}`,
      };
    } catch (error) {
      fetchErrors += 1;
      return {
        id: film.id,
        title: film.title,
        year: film.year,
        country: film.country,
        media_type: film.media_type,
        catalog_visible: film.catalog_visible,
        tmdb_id: film.tmdb_id,
        tmdb_match_status: "error",
        availability: film.availability,
        tmdb_regions_total: 0,
        regions: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const usefulExamples = [];
  for (const row of rows) {
    if (row.error) continue;
    for (const region of options.regions) {
      const r = row.regions?.[region];
      if (r?.hasStream) {
        usefulExamples.push({
          title: row.title,
          year: row.year,
          region,
          stream: r.providers.flatrate.slice(0, 4),
          free: r.providers.free.slice(0, 2),
          link: r.link,
        });
        break;
      }
    }
    if (usefulExamples.length >= 15) break;
  }

  const emptyExamples = rows
    .filter(
      (row) =>
        row.tmdb_id != null &&
        !row.error &&
        options.regions.every((region) => !row.regions?.[region]?.total)
    )
    .slice(0, 15)
    .map((row) => ({
      title: row.title,
      year: row.year,
      country: row.country,
      tmdb_id: row.tmdb_id,
      tmdb_regions_total: row.tmdb_regions_total,
    }));

  const resolvedBase = resolvedCount || 1;
  const summary = {
    generatedAt: new Date().toISOString(),
    scope: {
      visibleOnly: options.visibleOnly,
      resolveTmdb: options.resolveTmdb,
      limit: options.limit,
      regions: options.regions,
    },
    counts: {
      films: films.length,
      storedTmdbId: storedTmdb,
      resolvedTmdbId: resolvedCount,
      unresolvedTmdbId: unresolvedCount,
      fetchErrors,
      anySampleRegionHit: anyRegionHit,
      allSampleRegionsEmpty,
      matchStatus: Object.fromEntries(matchStatusCounts),
    },
    byRegion: Object.fromEntries(
      options.regions.map((region) => {
        const s = regionStats[region];
        return [
          region,
          {
            withAny: s.withAny,
            withAnyPct: Math.round((s.withAny / resolvedBase) * 1000) / 10,
            withStream: s.withStream,
            withStreamPct: Math.round((s.withStream / resolvedBase) * 1000) / 10,
            withRentOrBuyOnly: s.withRentOrBuyOnly,
            empty: s.empty,
            topStreamProviders: topFromMap(s.topStream),
          },
        ];
      })
    ),
    usefulExamples,
    emptyInSampleRegionsExamples: emptyExamples,
  };

  const report = { summary, films: rows };
  mkdirSync(path.dirname(options.outPath), { recursive: true });
  writeFileSync(options.outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${options.outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
