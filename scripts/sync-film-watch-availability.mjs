/**
 * Sync films.watch_availability from TMDB watch/providers (all regions).
 *
 * Fill films that still have no snapshot (weekly):
 *   APP_ENV=hosted node scripts/sync-film-watch-availability.mjs --missing-only --visible-only
 *
 * Recheck previously empty snapshots older than N days (monthly):
 *   APP_ENV=hosted node scripts/sync-film-watch-availability.mjs --recheck-empty --visible-only
 *
 * Full refresh (overwrites TMDB offers; keeps deep-link fields) requires override:
 *   APP_ENV=hosted node scripts/sync-film-watch-availability.mjs --override-untrusted-tmdb --visible-only --limit=20
 */
import { createClient } from "@supabase/supabase-js";
import {
  TMDB_ANIMATION_GENRE_ID,
  evaluateTmdbMatch,
  getTitleSimilarity,
  getYearDifference,
} from "../lib/tmdb-film-matching.mjs";
import { normalizeWatchAvailability } from "../lib/film-watch-availability.mjs";
import {
  isMissingWatchAvailability,
  loadWatchAvailabilityFromTmdb,
  needsEmptyWatchRecheck,
} from "../lib/tmdb-watch-providers.mjs";
import { applyAppEnv } from "./load-app-env.mjs";

applyAppEnv();

const CONCURRENCY = 6;

function parseArgs(argv) {
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const staleDaysArg = argv.find((a) => a.startsWith("--empty-stale-days="));
  const staleDays = staleDaysArg
    ? Number(staleDaysArg.slice("--empty-stale-days=".length))
    : 30;
  return {
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    visibleOnly: argv.includes("--visible-only"),
    resolveTmdb: argv.includes("--resolve-tmdb"),
    dryRun: argv.includes("--dry-run"),
    missingOnly: argv.includes("--missing-only"),
    recheckEmpty: argv.includes("--recheck-empty"),
    emptyStaleDays:
      Number.isFinite(staleDays) && staleDays > 0 ? staleDays : 30,
    overrideUntrustedTmdb: argv.includes("--override-untrusted-tmdb"),
  };
}

async function loadFilms(
  supabase,
  { visibleOnly, missingOnly, recheckEmpty, emptyStaleDays, limit }
) {
  const pageSize = 1000;
  const films = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("films")
      .select(
        "id, title, original_title, director, year, country, media_type, catalog_visible, tmdb_id, watch_availability"
      )
      .order("title")
      .range(from, from + pageSize - 1);
    if (visibleOnly) {
      query = query.eq("catalog_visible", true);
    }
    if (missingOnly) {
      // Prefer DB nulls; also post-filter invalid snapshots below.
      query = query.is("watch_availability", null);
    } else if (recheckEmpty) {
      query = query.not("watch_availability", "is", null);
    }
    const { data, error } = await query;
    if (error) throw error;
    films.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }

  const emptyMaxAgeMs = emptyStaleDays * 24 * 60 * 60 * 1000;
  let filtered = films;
  if (missingOnly) {
    filtered = films.filter((film) =>
      isMissingWatchAvailability(film.watch_availability)
    );
  } else if (recheckEmpty) {
    filtered = films.filter((film) =>
      needsEmptyWatchRecheck(film.watch_availability, {
        maxAgeMs: emptyMaxAgeMs,
      })
    );
  }

  if (limit != null && Number.isFinite(limit) && limit > 0) {
    return filtered.slice(0, limit);
  }
  return filtered;
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
  if (options.missingOnly && options.recheckEmpty) {
    throw new Error("Use either --missing-only or --recheck-empty, not both.");
  }
  if (
    !options.missingOnly &&
    !options.recheckEmpty &&
    !options.overrideUntrustedTmdb
  ) {
    throw new Error(
      "Refusing full TMDB watch/providers sync. Use --missing-only, --recheck-empty, or --override-untrusted-tmdb."
    );
  }
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
    `Films: ${films.length}; missingOnly=${options.missingOnly}; recheckEmpty=${options.recheckEmpty}; emptyStaleDays=${options.emptyStaleDays}; visibleOnly=${options.visibleOnly}; resolveTmdb=${options.resolveTmdb}; dryRun=${options.dryRun}`
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
      const current = normalizeWatchAvailability(film.watch_availability);
      if (resolved.tmdbId == null) {
        unresolved += 1;
        // Do not write an empty snapshot without a TMDB id — leave missing
        // so a later resolve-tmdb pass can still fill it.
        return {
          filmId: film.id,
          title: film.title,
          payload: null,
          skipWrite: true,
          matchStatus: resolved.matchStatus,
        };
      }

      const payload = await loadWatchAvailabilityFromTmdb({
        tmdbId: resolved.tmdbId,
        apiKey: tmdbApiKey,
        current,
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
      const chunk = rows
        .slice(i, i + 50)
        .filter((row) => !row.skipWrite && row.payload);
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
        missingOnly: options.missingOnly,
        recheckEmpty: options.recheckEmpty,
        emptyStaleDays: options.emptyStaleDays,
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
