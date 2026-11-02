/**
 * ONE-SHOT: resolve MUBI deep links via OpenAI web search.
 * Do not wire into automatic Watch refresh / cron.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/sync-mubi-watch-links.mjs --visible-only --limit=5 --dry-run
 *   APP_ENV=hosted node scripts/sync-mubi-watch-links.mjs --visible-only --limit=5
 *   APP_ENV=hosted node scripts/sync-mubi-watch-links.mjs --visible-only --force
 */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeWatchAvailability,
  stripWatchProviders,
} from "../lib/film-watch-availability.mjs";
import {
  offersIncludeMubi,
  resolveMubiFilmLink,
} from "../lib/mubi-watch-links.mjs";
import { applyAppEnv } from "./load-app-env.mjs";

applyAppEnv();

function parseArgs(argv) {
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  return {
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    visibleOnly: argv.includes("--visible-only"),
    animationOnly: argv.includes("--animation-only"),
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function loadFilms(supabase, { visibleOnly, animationOnly, limit }) {
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
  if (limit != null && Number.isFinite(limit) && limit > 0) {
    return films.slice(0, limit);
  }
  return films;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL / service role");
  }
  if (!openaiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  const films = await loadFilms(supabase, {
    visibleOnly: options.visibleOnly,
    animationOnly: options.animationOnly,
    limit: null,
  });

  const jobs = [];
  for (const film of films) {
    const availability = normalizeWatchAvailability(film.watch_availability);
    if (!availability || !offersIncludeMubi(availability.offers)) continue;
    if (!options.force && availability.mubi_links?.url) continue;
    jobs.push({ film, availability });
  }

  const limited =
    options.limit != null && Number.isFinite(options.limit) && options.limit > 0
      ? jobs.slice(0, options.limit)
      : jobs;

  console.log(
    JSON.stringify(
      {
        scanned: films.length,
        mubiCandidates: jobs.length,
        running: limited.length,
        dryRun: options.dryRun,
        force: options.force,
      },
      null,
      2
    )
  );

  let found = 0;
  let missing = 0;
  let written = 0;
  let errors = 0;
  const samples = [];

  for (let i = 0; i < limited.length; i += 1) {
    const job = limited[i];
    console.log(`… ${i + 1}/${limited.length} ${job.film.title}`);
    try {
      const resolved = await resolveMubiFilmLink({
        openai,
        title: job.film.title,
        originalTitle: job.film.original_title,
        year: job.film.year,
      });
      if (!resolved) {
        missing += 1;
        samples.push({
          title: job.film.title,
          year: job.film.year,
          url: null,
        });
        if (options.dryRun) continue;
        const missPayload = {
          ...job.availability,
          offers: stripWatchProviders(job.availability.offers, "MUBI"),
          mubi_links: {
            checked_at: new Date().toISOString(),
            url: null,
            slug: null,
          },
        };
        const { error } = await supabase
          .from("films")
          .update({ watch_availability: missPayload })
          .eq("id", job.film.id);
        if (error) {
          errors += 1;
          console.error(`Update failed ${job.film.title}: ${error.message}`);
        } else {
          written += 1;
        }
        continue;
      }
      found += 1;
      samples.push({
        title: job.film.title,
        year: job.film.year,
        url: resolved.url,
        slug: resolved.slug,
      });

      if (options.dryRun) continue;

      const payload = {
        ...job.availability,
        mubi_links: {
          checked_at: new Date().toISOString(),
          url: resolved.url,
          slug: resolved.slug,
        },
      };
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
    } catch (error) {
      errors += 1;
      console.error(
        `MUBI link failed ${job.film.title}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(
    JSON.stringify(
      { found, missing, written, errors, dryRun: options.dryRun, samples },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
