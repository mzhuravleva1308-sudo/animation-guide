import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  AI_DISCOVERY_SOURCE,
  extractAiFestivalCandidates,
} from "../lib/ai-festival-discovery.mjs";
import {
  dedupeCandidates,
  extractLegacyCatalogCandidates,
} from "../lib/backfill-film-festival-recognitions.mjs";
import {
  candidateToClaimRow,
  summarizeClaimStatuses,
  upsertFilmFestivalClaims,
} from "../lib/film-festival-claim.mjs";
import { FESTIVAL_OFFICIAL_SOURCES } from "../lib/festival-official-sources.mjs";
import { loadFixtureFilmIds } from "../lib/backfill-report-utils.mjs";

applyAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports");

const FILM_FIELDS = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "festival",
  "section",
  "source_url",
].join(", ");

const DEFAULT_CONCURRENCY = 6;

/**
 * @param {string[]} args
 */
function parseArgs(args) {
  const limitArgIndex = args.indexOf("--limit");
  const offsetArgIndex = args.indexOf("--offset");
  const festivalArgIndex = args.indexOf("--festival");
  const filmIdsArgIndex = args.indexOf("--film-ids");
  const concurrencyArgIndex = args.indexOf("--concurrency");

  const festivalId =
    festivalArgIndex === -1
      ? null
      : String(args[festivalArgIndex + 1] ?? "").trim().toLowerCase() || null;

  const filmIds =
    filmIdsArgIndex === -1
      ? null
      : String(args[filmIdsArgIndex + 1] ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

  return {
    dryRun: args.includes("--dry-run"),
    sample: args.includes("--sample"),
    controlBatch: args.includes("--control-batch"),
    annecyBatch: args.includes("--annecy-batch"),
    festivalId,
    filmIds,
    limit:
      limitArgIndex === -1 ? null : Number.parseInt(args[limitArgIndex + 1], 10),
    offset:
      offsetArgIndex === -1
        ? 0
        : Number.parseInt(args[offsetArgIndex + 1], 10),
    concurrency:
      concurrencyArgIndex === -1
        ? DEFAULT_CONCURRENCY
        : Number.parseInt(args[concurrencyArgIndex + 1], 10),
    withoutClaimsOnly: args.includes("--without-claims"),
  };
}

function printUsage() {
  console.log(`Usage:
  APP_ENV=hosted node scripts/ai-festival-discovery.mjs [--festival ID] [--film-ids id1,id2] [--without-claims] [--limit N] [--offset N] [--concurrency N] [--dry-run] [--sample | --control-batch | --annecy-batch]

Fast primary discovery: one OpenAI call per film → one coarse "possibly at festival" claim.
No Wikipedia fetch, no archive crawling. Does NOT create confirmed recognitions.

  --without-claims   Process only catalog films that have no rows in film_festival_claims.`);
}

/**
 * @param {string | null} festivalId
 */
function validateFestivalId(festivalId) {
  if (!festivalId) {
    return;
  }

  if (!FESTIVAL_OFFICIAL_SOURCES.some((source) => source.id === festivalId)) {
    throw new Error(
      `--festival must be a configured festival id (${FESTIVAL_OFFICIAL_SOURCES.map((source) => source.id).join(", ")})`
    );
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function loadCatalogFilms(supabase, args) {
  if (args.filmIds?.length) {
    const { data, error } = await supabase
      .from("films")
      .select(FILM_FIELDS)
      .in("id", args.filmIds)
      .order("title", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  if (args.sample || args.controlBatch || args.annecyBatch) {
    const sampleIds = loadFixtureFilmIds({
      controlBatch: args.controlBatch,
      annecyBatch: args.annecyBatch,
    });
    const { data, error } = await supabase
      .from("films")
      .select(FILM_FIELDS)
      .in("id", sampleIds)
      .order("title", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  if (args.withoutClaimsOnly) {
    const [{ data: films, error: filmsError }, { data: claims, error: claimsError }] =
      await Promise.all([
        supabase.from("films").select(FILM_FIELDS).order("title", { ascending: true }),
        supabase.from("film_festival_claims").select("film_id"),
      ]);

    if (filmsError) {
      throw filmsError;
    }
    if (claimsError) {
      throw claimsError;
    }

    const claimedFilmIds = new Set((claims ?? []).map((row) => row.film_id));
    let unmatched = (films ?? []).filter((film) => !claimedFilmIds.has(film.id));

    if (args.limit != null) {
      unmatched = unmatched.slice(args.offset, args.offset + args.limit);
    }

    return unmatched;
  }

  let query = supabase
    .from("films")
    .select(FILM_FIELDS)
    .order("title", { ascending: true });

  if (args.limit != null) {
    query = query.range(args.offset, args.offset + args.limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 */
async function runWithConcurrency(tasks, concurrency) {
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      await tasks[current]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  validateFestivalId(args.festivalId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const openai = new OpenAI({ apiKey: openaiApiKey });
  const films = await loadCatalogFilms(supabase, args);

  const report = {
    discoverySource: AI_DISCOVERY_SOURCE,
    festivalId: args.festivalId,
    processed: 0,
    filmsWithClaims: 0,
    claimsSaved: 0,
    catalogClaims: 0,
    aiClaims: 0,
    errors: 0,
    statusCounts: {},
  };

  console.log(
    `AI festival discovery (${AI_DISCOVERY_SOURCE}) — ${films.length} film(s), concurrency ${args.concurrency}`
  );

  /** @type {Array<() => Promise<void>>} */
  const tasks = films.map((film) => async () => {
    report.processed += 1;

    try {
      const legacyCandidates = extractLegacyCatalogCandidates(film).map(
        (candidate) => ({
          ...candidate,
          discovery_source: AI_DISCOVERY_SOURCE,
        })
      );

      const aiCandidates = await extractAiFestivalCandidates(openai, film, {
        festivalFilterId: args.festivalId,
      });

      const combined = dedupeCandidates([...legacyCandidates, ...aiCandidates]);
      const claimRows = combined.map((candidate) =>
        candidateToClaimRow(candidate, film.id)
      );

      report.catalogClaims += legacyCandidates.length;
      report.aiClaims += aiCandidates.length;

      for (const row of claimRows) {
        report.statusCounts[row.claim_status] =
          (report.statusCounts[row.claim_status] ?? 0) + 1;
      }

      if (claimRows.length === 0) {
        return;
      }

      if (!args.dryRun) {
        const saved = await upsertFilmFestivalClaims(supabase, film.id, claimRows);
        report.claimsSaved += saved.length;
      } else {
        report.claimsSaved += claimRows.length;
      }

      report.filmsWithClaims += 1;
      const festivals = [
        ...new Set(
          claimRows.map((row) => String(row.canonical_festival_id ?? row.raw_festival_name))
        ),
      ].join(", ");
      console.log(
        `[ai-discovery] ${film.title} (${film.year ?? "?"}): ${claimRows.length} claim(s) [${festivals}]`
      );
    } catch (error) {
      report.errors += 1;
      console.error(
        `[ai-discovery-error] ${film.title}: ${
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String(error.message)
              : String(error)
        }`
      );
    }
  });

  await runWithConcurrency(tasks, args.concurrency);

  const { data: allClaims } = await supabase
    .from("film_festival_claims")
    .select("claim_status, canonical_festival_id, source_type")
    .eq("discovery_source", AI_DISCOVERY_SOURCE);

  const { count: totalFilms } = await supabase
    .from("films")
    .select("id", { count: "exact", head: true });

  const summary = {
    totalCatalogFilms: totalFilms ?? 0,
    claimsFromThisRun: report.claimsSaved,
    claimsInDbForSource: allClaims?.length ?? 0,
    byStatus: summarizeClaimStatuses(allClaims ?? []),
    bySourceType: (allClaims ?? []).reduce((acc, row) => {
      const key = String(row.source_type);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, /** @type {Record<string, number>} */ ({})),
  };

  if (args.festivalId) {
    summary.annecyClaims =
      allClaims?.filter((row) => row.canonical_festival_id === args.festivalId)
        .length ?? 0;
  }

  mkdirSync(REPORTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORTS_DIR, `ai-festival-discovery-${timestamp}.json`);
  writeFileSync(
    jsonPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), report, summary }, null, 2)}\n`
  );

  console.log("\n=== AI discovery summary ===");
  console.log(`- catalog films: ${summary.totalCatalogFilms}`);
  console.log(`- processed: ${report.processed}`);
  console.log(`- films with claims: ${report.filmsWithClaims}`);
  console.log(`- claims saved this run: ${report.claimsSaved}`);
  console.log(`- catalog-derived: ${report.catalogClaims}`);
  console.log(`- AI-derived: ${report.aiClaims}`);
  console.log(`- errors: ${report.errors}`);
  console.log("- claim statuses this run:");
  for (const [status, count] of Object.entries(report.statusCounts).sort()) {
    console.log(`  - ${status}: ${count}`);
  }
  console.log(`- JSON report: ${jsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
