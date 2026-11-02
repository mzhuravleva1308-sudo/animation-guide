/**
 * One-shot / periodic enrich of films.watch_availability.apple_links
 * via the public iTunes Search API (no Apple developer key).
 *
 * Searches once per film (trackId), then lookups per priority country.
 *
 * Usage:
 *   node scripts/sync-apple-watch-links.mjs --visible-only
 *   node scripts/sync-apple-watch-links.mjs --visible-only --limit=20
 *   node scripts/sync-apple-watch-links.mjs --visible-only --force
 *   node scripts/sync-apple-watch-links.mjs --dry-run --visible-only --limit=5
 */
import { createClient } from "@supabase/supabase-js";
import {
  prioritizeAppleLinkRegions,
  resolveAppleMovieLinksForRegions,
} from "../lib/apple-movie-links.mjs";
import {
  appleRegionsFromOffers,
  normalizeWatchAvailability,
  stripWatchProviders,
} from "../lib/film-watch-availability.mjs";
import { applyAppEnv } from "./load-app-env.mjs";

applyAppEnv();

function parseArgs(argv) {
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const regionsArg = argv.find((a) => a.startsWith("--regions="));
  return {
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    maxRegions: regionsArg
      ? Number(regionsArg.slice("--regions=".length))
      : Number(process.env.WATCH_APPLE_MAX_REGIONS ?? 5) || 5,
    visibleOnly: argv.includes("--visible-only"),
    animationOnly: argv.includes("--animation-only"),
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function loadFilms(supabase, { visibleOnly, animationOnly }) {
  const pageSize = 1000;
  const films = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("films")
      .select(
        "id, title, original_title, year, catalog_visible, media_type, watch_availability"
      )
      .order("title")
      .range(from, from + pageSize - 1);
    if (visibleOnly) {
      query = query.eq("catalog_visible", true);
    }
    if (animationOnly) {
      query = query.eq("media_type", "animation");
    }
    const { data, error } = await query;
    if (error) throw error;
    films.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return films;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL / service role");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const films = await loadFilms(supabase, options);
  const jobs = [];

  for (const film of films) {
    const availability = normalizeWatchAvailability(film.watch_availability);
    if (!availability?.offers?.length) continue;
    // Skip once checked (including empty by_region) unless --force.
    if (!options.force && availability.apple_links?.checked_at) continue;
    const appleRegions = prioritizeAppleLinkRegions(
      appleRegionsFromOffers(availability.offers),
      options.maxRegions
    );
    if (!appleRegions.length) continue;

    const existing = availability.apple_links?.by_region ?? {};
    const missing = options.force
      ? appleRegions
      : appleRegions.filter((code) => !existing[code]);
    if (!missing.length && availability.apple_links?.track_id) continue;
    if (!missing.length) continue;

    jobs.push({
      film,
      availability,
      regions: missing,
      existing,
      knownTrackId: availability.apple_links?.track_id ?? null,
    });
  }

  const limited =
    options.limit != null && Number.isFinite(options.limit) && options.limit > 0
      ? jobs.slice(0, options.limit)
      : jobs;

  console.log(
    JSON.stringify(
      {
        scanned: films.length,
        appleCandidates: jobs.length,
        running: limited.length,
        maxRegions: options.maxRegions,
        pauseMs: Number(process.env.WATCH_APPLE_PAUSE_MS ?? 3500) || 3500,
        force: options.force,
        dryRun: options.dryRun,
      },
      null,
      2
    )
  );

  let filmsWithLinks = 0;
  let linkCount = 0;
  let written = 0;
  let errors = 0;
  let rateLimited = false;

  const pauseMs = Number(process.env.WATCH_APPLE_PAUSE_MS ?? 3500) || 3500;

  for (let index = 0; index < limited.length; index += 1) {
    if (rateLimited) break;
    const job = limited[index];
    console.log(`… ${index + 1}/${limited.length} ${job.film.title}`);

    try {
      const resolved = await resolveAppleMovieLinksForRegions({
        title: job.film.title,
        originalTitle: job.film.original_title,
        year: job.film.year,
        regions: job.regions,
        knownTrackId: job.knownTrackId,
        pauseMs,
        sleep,
      });

      const nextLinks = options.force
        ? { ...resolved.byRegion }
        : { ...job.existing, ...resolved.byRegion };

      const newCount = Object.keys(resolved.byRegion).length;
      if (newCount) {
        filmsWithLinks += 1;
        linkCount += newCount;
      }

      const foundCount = Object.keys(nextLinks).length;
      const payload = {
        ...job.availability,
        // No Apple store page found → drop Apple from our snapshot.
        offers:
          foundCount > 0
            ? job.availability.offers
            : stripWatchProviders(job.availability.offers, [
                "Apple TV",
                "Apple TV+",
              ]),
        apple_links: {
          checked_at: new Date().toISOString(),
          track_id: resolved.trackId,
          by_region: nextLinks,
        },
      };

      console.log(
        JSON.stringify(
          {
            title: job.film.title,
            trackId: resolved.trackId,
            requested: job.regions.length,
            found: Object.keys(resolved.byRegion).length,
            strippedApple: foundCount === 0,
            sample: Object.entries(resolved.byRegion)
              .slice(0, 3)
              .map(([code, url]) => ({ code, url })),
          },
          null,
          2
        )
      );

      if (!options.dryRun) {
        const { error } = await supabase
          .from("films")
          .update({ watch_availability: payload })
          .eq("id", job.film.id);
        if (error) {
          errors += 1;
          console.error(`Update failed ${job.film.title}: ${error.message}`);
        } else {
          written += 1;
        }
      }

      await sleep(pauseMs);
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Apple links failed ${job.film.title}:`, message);
      if (/\b(403|429)\b/.test(message)) {
        rateLimited = true;
        console.error("Stopping early due to iTunes rate limit; re-run later.");
      } else {
        await sleep(pauseMs * 2);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        jobs: jobs.length,
        ran: limited.length,
        filmsWithLinks,
        linkCount,
        written: options.dryRun ? 0 : written,
        errors,
        rateLimited,
        dryRun: options.dryRun,
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
