/**
 * Sync films.watch_availability from TMDB watch/providers (all regions).
 *
 * Usage:
 *   APP_ENV=hosted node scripts/sync-film-watch-availability.mjs
 *   APP_ENV=hosted node scripts/sync-film-watch-availability.mjs --visible-only --limit=20
 *   APP_ENV=hosted node scripts/sync-film-watch-availability.mjs --dry-run --visible-only --limit=5
 *   APP_ENV=hosted node scripts/sync-film-watch-availability.mjs --resolve-tmdb --visible-only
 */
import { createClient } from "@supabase/supabase-js";
import {
  TMDB_ANIMATION_GENRE_ID,
  evaluateTmdbMatch,
  getTitleSimilarity,
  getYearDifference,
} from "../lib/tmdb-film-matching.mjs";
import { buildWatchAvailabilityFromTmdbResults } from "../lib/film-watch-availability.mjs";
import { applyAppEnv } from "./load-app-env.mjs";

applyAppEnv();

const CONCURRENCY = 6;

function parseArgs(argv) {
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  return {
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    visibleOnly: argv.includes("--visible-only"),
    resolveTmdb: argv.includes("--resolve-tmdb"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function loadFilms(supabase, { visibleOnly, limit }) {
  const pageSize = 1000;
  const films = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("films")
      .select(
        "id, title, original_title, director, year, country, media_type, catalog_visible, tmdb_id"
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

function pickTmdbMatch(film, results) {
  if (!results.length) {
    return { tmdbId: null, matchStatus: "no_search_hits" };
  }

  const scored = results.map((result) => {
    const evaluation = evaluateTmdbMatch(film, result);
    const titleSimilarity = Math.max(
      getTitleSimilarity(film.title, result.title),
      getTitleSimilarity(film.original_title, result.title),
      getTitleSimilarity(film.title, result.original_title),
      getTitleSimilarity(film.original_title, result.original_title)
    );
    const yearDiff = getYearDifference(film.year, result.release_date);
    const isAnimation = Array.isArray(result.genre_ids)
      ? result.genre_ids.includes(TMDB_ANIMATION_GENRE_ID)
      : false;
    return { result, evaluation, titleSimilarity, yearDiff, isAnimation };
  });

  scored.sort((a, b) => {
    if (a.evaluation.ok !== b.evaluation.ok) {
      return a.evaluation.ok ? -1 : 1;
    }
    if (b.titleSimilarity !== a.titleSimilarity) {
      return b.titleSimilarity - a.titleSimilarity;
    }
    const aYear = a.yearDiff ?? 99;
    const bYear = b.yearDiff ?? 99;
    if (aYear !== bYear) return aYear - bYear;
    if (a.isAnimation !== b.isAnimation) return a.isAnimation ? -1 : 1;
    return 0;
  });

  const best = scored[0];
  if (best.evaluation.ok) {
    return { tmdbId: best.result.id, matchStatus: "matched_strict" };
  }
  if (
    best.titleSimilarity >= 0.92 &&
    (best.yearDiff == null || best.yearDiff <= 1) &&
    (film.media_type !== "animation" || best.isAnimation)
  ) {
    return { tmdbId: best.result.id, matchStatus: "matched_title_year" };
  }
  return { tmdbId: null, matchStatus: "no_confident_match" };
}

async function resolveTmdbId(apiKey, film, { resolveTmdb }) {
  if (film.tmdb_id != null) {
    return { tmdbId: film.tmdb_id, matchStatus: "stored" };
  }
  if (!resolveTmdb) {
    return { tmdbId: null, matchStatus: "skipped_no_stored_id" };
  }
  const results = await searchTmdbMovies(apiKey, film);
  return pickTmdbMatch(film, results);
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tmdbApiKey =
    process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL / service role (use APP_ENV=hosted|local)");
  }
  if (!tmdbApiKey) {
    throw new Error("Missing TMDB_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const films = await loadFilms(supabase, options);
  console.log(
    `Films: ${films.length}; visibleOnly=${options.visibleOnly}; resolveTmdb=${options.resolveTmdb}; dryRun=${options.dryRun}`
  );

  let withOffers = 0;
  let emptyOffers = 0;
  let unresolved = 0;
  let errors = 0;
  let written = 0;

  const rows = await mapPool(films, CONCURRENCY, async (film, index) => {
    if (index > 0 && index % 50 === 0) {
      console.log(`… ${index}/${films.length}`);
    }
    try {
      const resolved = await resolveTmdbId(tmdbApiKey, film, options);
      if (resolved.tmdbId == null) {
        unresolved += 1;
        const payload = buildWatchAvailabilityFromTmdbResults(
          {},
          { tmdbId: null }
        );
        return { filmId: film.id, title: film.title, payload, skipWrite: false };
      }

      const providers = await fetchWatchProviders(tmdbApiKey, resolved.tmdbId);
      const payload = buildWatchAvailabilityFromTmdbResults(providers.results, {
        tmdbId: resolved.tmdbId,
      });
      if (payload.offers.length) withOffers += 1;
      else emptyOffers += 1;
      return {
        filmId: film.id,
        title: film.title,
        payload,
        skipWrite: false,
        matchStatus: resolved.matchStatus,
      };
    } catch (error) {
      errors += 1;
      console.error(
        `Failed ${film.title}:`,
        error instanceof Error ? error.message : error
      );
      return { filmId: film.id, title: film.title, payload: null, skipWrite: true };
    }
  });

  if (!options.dryRun) {
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50).filter((row) => !row.skipWrite && row.payload);
      await Promise.all(
        chunk.map(async (row) => {
          const { error } = await supabase
            .from("films")
            .update({ watch_availability: row.payload })
            .eq("id", row.filmId);
          if (error) {
            throw new Error(`Update ${row.title}: ${error.message}`);
          }
          written += 1;
        })
      );
    }
  }

  const samples = rows
    .filter((row) => row.payload?.offers?.length)
    .slice(0, 8)
    .map((row) => ({
      title: row.title,
      offers: row.payload.offers.slice(0, 4).map((o) => ({
        provider: o.provider,
        type: o.type,
        regions: o.regions.slice(0, 6),
        regionCount: o.regions.length,
      })),
    }));

  console.log(
    JSON.stringify(
      {
        withOffers,
        emptyOffers,
        unresolved,
        errors,
        written: options.dryRun ? 0 : written,
        dryRun: options.dryRun,
        samples,
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
