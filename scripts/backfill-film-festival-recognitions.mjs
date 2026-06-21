import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import { discoverAnnecyCandidatesFromArchiveSearch } from "../lib/annecy-title-discovery.mjs";
import {
  buildFilmFestivalEvidence,
  CATALOG_BACKFILL_IMPORT_SOURCE,
  dedupeCandidates,
  extractLegacyCatalogCandidates,
  isFilmInFestivalScope,
  rebuildImportableFromCandidates,
  summarizeEvidenceStatuses,
} from "../lib/backfill-film-festival-recognitions.mjs";
import { EVIDENCE_STATUSES } from "../lib/festival-evidence-quality.mjs";
import { FESTIVAL_OFFICIAL_SOURCES } from "../lib/festival-official-sources.mjs";
import {
  buildImportableRecognitions,
  verifyFilmFestivalPresence,
} from "../lib/festival-presence-pipeline.mjs";
import { extractWikipediaFestivalCandidates } from "../lib/extract-festival-recognitions-openai.mjs";
import {
  CLAIM_STATUSES,
  RECOGNITION_TYPE_POSSIBLE,
  candidateToClaimRow,
  loadFilmFestivalClaimsForVerification,
  summarizeClaimStatuses,
  toPersistedClaimStatus,
  upsertFilmFestivalClaims,
} from "../lib/film-festival-claim.mjs";
import { upsertFilmFestivalRecognitions } from "../lib/film-festival-recognition.mjs";
import {
  findWikipediaArticle,
  fetchWikipediaExternalLinks,
} from "../lib/wikipedia-festival-research.mjs";
import { loadFixtureFilmIds } from "../lib/backfill-report-utils.mjs";

applyAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports");

/** Tier 3 (award/section extraction → recognitions) disabled until needed. */
const PRESENCE_ONLY_VERIFICATION = true;

const FILM_FIELDS = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "festival",
  "section",
  "source_url",
].join(", ");

/**
 * @param {string[]} args
 */
function parseArgs(args) {
  const limitArgIndex = args.indexOf("--limit");
  const offsetArgIndex = args.indexOf("--offset");
  const festivalArgIndex = args.indexOf("--festival");
  const festivalIdArgIndex = args.indexOf("--festival-id");
  const filmIdsArgIndex = args.indexOf("--film-ids");
  const phaseArgIndex = args.indexOf("--phase");
  const festivalIdRaw =
    festivalArgIndex === -1
      ? festivalIdArgIndex === -1
        ? null
        : args[festivalIdArgIndex + 1]
      : args[festivalArgIndex + 1];
  const festivalId = festivalIdRaw ? String(festivalIdRaw).trim().toLowerCase() : null;
  const controlBatch = args.includes("--control-batch");
  const annecyBatch =
    args.includes("--annecy-batch") ||
    (festivalId === "annecy" && controlBatch);
  const resolvedFestivalId =
    festivalId ?? (annecyBatch ? "annecy" : null);
  const phaseRaw =
    phaseArgIndex === -1 ? "full" : String(args[phaseArgIndex + 1] ?? "full");
  const phase = /** @type {"discovery"|"verification"|"full"} */ (phaseRaw);
  const filmIds =
    filmIdsArgIndex === -1
      ? null
      : String(args[filmIdsArgIndex + 1] ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    sample: args.includes("--sample"),
    controlBatch,
    annecyBatch,
    festivalId: resolvedFestivalId,
    phase,
    filmIds,
    limit:
      limitArgIndex === -1 ? null : Number.parseInt(args[limitArgIndex + 1], 10),
    offset:
      offsetArgIndex === -1
        ? 0
        : Number.parseInt(args[offsetArgIndex + 1], 10),
  };
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    return JSON.stringify(error);
  }

  return String(error);
}

function printUsage() {
  console.log(`Usage:
  node scripts/backfill-film-festival-recognitions.mjs [--sample | --control-batch | --annecy-batch] [--festival ID | --festival-id ID] [--phase discovery|verification|full] [--film-ids id1,id2] [--limit N] [--offset N] [--dry-run] [--force]

Two-layer Annecy pipeline (three tiers):
  --phase discovery   Tier 1: persist "possibly at festival" claims (AI / catalog hints).
  --phase verification  Tier 2–3: film-first official presence check + award extraction from annecyfestival.com.
  --phase full        Run discovery then verification (default).

Claims are idempotent on (film_id, dedupe_key). Recognitions import only after official verification.`);
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
      `--festival must be a configured festival id (${FESTIVAL_OFFICIAL_SOURCES.map((source) => source.id).join(", ")}); got "${festivalId}"`
    );
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function loadCatalogFilms(supabase, { limit, offset, sample, controlBatch, annecyBatch, filmIds }) {
  if (filmIds?.length) {
    const { data, error } = await supabase
      .from("films")
      .select(FILM_FIELDS)
      .in("id", filmIds)
      .order("title", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  if (sample || controlBatch || annecyBatch) {
    const sampleIds = loadFixtureFilmIds({ controlBatch, annecyBatch });
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

  let query = supabase
    .from("films")
    .select(FILM_FIELDS)
    .order("title", { ascending: true });

  if (limit != null) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function countCatalogFilms(supabase) {
  const { count, error } = await supabase
    .from("films")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  return count ?? 0;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} canonicalFestivalId
 */
async function loadAnnecyClaimSummary(supabase, canonicalFestivalId = "annecy") {
  const { data, error } = await supabase
    .from("film_festival_claims")
    .select("claim_status, film_id, dedupe_key, raw_festival_name, festival_year, section, award_name, source_type, source_url, official_url, verification_reason")
    .eq("canonical_festival_id", canonicalFestivalId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} canonicalFestivalId
 */
async function loadConfirmedRecognitions(supabase, canonicalFestivalId = "annecy") {
  const { data, error } = await supabase
    .from("film_festival_recognitions")
    .select("id, film_id, dedupe_key, confidence_status")
    .eq("canonical_festival_id", canonicalFestivalId)
    .eq("confidence_status", "confirmed_official");

  if (error) {
    throw error;
  }

  return data ?? [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Record<string, unknown>[]} rows
 */
function writeCsv(filePath, rows) {
  if (rows.length === 0) {
    writeFileSync(filePath, "\n");
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? "");
          if (/[",\n]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    ),
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {OpenAI} openai
 * @param {ReturnType<typeof parseArgs>} args
 */
async function runDiscoveryPhase(supabase, openai, args) {
  const films = await loadCatalogFilms(supabase, args);
  const report = {
    phase: "discovery",
    processed: 0,
    filmsWithClaims: 0,
    claimsSaved: 0,
    archiveSearchHits: 0,
    skippedNoAnnecySignal: 0,
    errors: 0,
    statusCounts: {},
    manualReviewFilms: [],
  };

  console.log(`\n=== Discovery phase (${args.festivalId ?? "all"}) ===`);
  console.log(`Films in batch: ${films.length}`);

  for (const film of films) {
    report.processed += 1;

    try {
      let wikipediaCandidates = [];
      const legacyCandidates = extractLegacyCatalogCandidates(film);
      const wikipedia = await findWikipediaArticle(film);

      if (wikipedia) {
        try {
          wikipediaCandidates = await extractWikipediaFestivalCandidates(
            openai,
            film,
            wikipedia
          );
        } catch {
          wikipediaCandidates = [];
        }
        await sleep(250);
      }

      if (
        args.festivalId &&
        !isFilmInFestivalScope(args.festivalId, {
          film,
          legacyCandidates,
          wikipediaCandidates,
        })
      ) {
        if (args.festivalId === "annecy") {
          const archiveCandidates = await discoverAnnecyCandidatesFromArchiveSearch(
            film
          );
          if (archiveCandidates.length === 0) {
            report.skippedNoAnnecySignal += 1;
            continue;
          }

          report.archiveSearchHits += archiveCandidates.length;
          const claimRows = archiveCandidates.map((candidate) =>
            candidateToClaimRow(candidate, film.id)
          );

          if (!args.dryRun) {
            const saved = await upsertFilmFestivalClaims(supabase, film.id, claimRows);
            report.claimsSaved += saved.length;
          } else {
            report.claimsSaved += claimRows.length;
          }

          report.filmsWithClaims += 1;
          if (archiveCandidates.some((candidate) => candidate.needs_manual_review)) {
            report.manualReviewFilms.push({
              film_id: film.id,
              title: film.title,
              year: film.year,
              reason: "archive_title_search_match",
            });
          }
          continue;
        }

        report.skippedNoAnnecySignal += 1;
        continue;
      }

      const evidence = buildFilmFestivalEvidence(
        film,
        wikipedia,
        wikipediaCandidates,
        { festivalFilterId: args.festivalId }
      );

      /** @type {import("../lib/festival-evidence-quality.mjs").FestivalEvidenceCandidate[]} */
      let allCandidates = [...evidence.allCandidates];

      if (args.festivalId === "annecy") {
        const archiveCandidates = await discoverAnnecyCandidatesFromArchiveSearch(film);
        if (archiveCandidates.length > 0) {
          report.archiveSearchHits += archiveCandidates.length;
          allCandidates = dedupeCandidates([
            ...allCandidates,
            ...archiveCandidates,
          ]);
        }
      }

      if (allCandidates.length === 0) {
        continue;
      }

      const claimRows = allCandidates.map((candidate) =>
        candidateToClaimRow(candidate, film.id)
      );

      for (const row of claimRows) {
        report.statusCounts[row.claim_status] =
          (report.statusCounts[row.claim_status] ?? 0) + 1;
      }

      if (!args.dryRun) {
        const saved = await upsertFilmFestivalClaims(supabase, film.id, claimRows);
        report.claimsSaved += saved.length;
      } else {
        report.claimsSaved += claimRows.length;
      }

      report.filmsWithClaims += 1;

      if (
        allCandidates.some(
          (candidate) =>
            candidate.needs_manual_review ||
            candidate.source_type === "archive_title_search"
        )
      ) {
        report.manualReviewFilms.push({
          film_id: film.id,
          title: film.title,
          year: film.year,
          reason: "title_matching_or_archive_coverage",
        });
      }

      console.log(
        `[discovery] ${film.title} (${film.year ?? "?"}): ${claimRows.length} claim(s)`
      );
    } catch (error) {
      report.errors += 1;
      console.error(`[discovery-error] ${film.title}: ${formatError(error)}`);
    }
  }

  return report;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {ReturnType<typeof parseArgs>} args
 */
async function runVerificationPhase(supabase, args) {
  const festivalId = args.festivalId ?? "annecy";

  /** @type {Map<string, Record<string, unknown>[]>} */
  const claimsByFilm = new Map();

  if (args.filmIds?.length) {
    const { data, error } = await supabase
      .from("film_festival_claims")
      .select("*")
      .eq("canonical_festival_id", festivalId)
      .in("film_id", args.filmIds);

    if (error) {
      throw error;
    }

    for (const claim of data ?? []) {
      const filmId = String(claim.film_id);
      const bucket = claimsByFilm.get(filmId) ?? [];
      bucket.push(claim);
      claimsByFilm.set(filmId, bucket);
    }

    for (const filmId of args.filmIds.map(String)) {
      if (!claimsByFilm.has(filmId)) {
        claimsByFilm.set(filmId, []);
      }
    }
  } else {
    const claims = await loadFilmFestivalClaimsForVerification(supabase, {
      canonicalFestivalId: festivalId,
      claimStatuses: [
        CLAIM_STATUSES.POSSIBLY,
        CLAIM_STATUSES.DISCOVERED,
        CLAIM_STATUSES.REJECTED,
      ],
    });

    for (const claim of claims) {
      const filmId = String(claim.film_id);
      const bucket = claimsByFilm.get(filmId) ?? [];
      bucket.push(claim);
      claimsByFilm.set(filmId, bucket);
    }
  }

  const filmIds = [...claimsByFilm.keys()];
  /** @type {Map<string, Record<string, unknown>>} */
  const filmsById = new Map();

  if (filmIds.length > 0) {
    const { data, error } = await supabase
      .from("films")
      .select(FILM_FIELDS)
      .in("id", filmIds);

    if (error) {
      throw error;
    }

    for (const film of data ?? []) {
      filmsById.set(String(film.id), film);
    }
  }

  const report = {
    phase: "verification",
    processed: 0,
    presenceConfirmed: 0,
    notAtFestival: 0,
    enriched: 0,
    stillPossible: 0,
    blocked: 0,
    savedRecognitions: 0,
    errors: 0,
    manualReviewFilms: [],
    verificationLog: [],
  };

  console.log(`\n=== Verification phase (${festivalId}) ===`);
  console.log(
    `Pending films: ${filmIds.length} (${[...claimsByFilm.values()].flat().length} claim hint row(s))`
  );

  for (const filmId of filmIds) {
    report.processed += 1;
    const film = filmsById.get(filmId);
    const filmClaims = claimsByFilm.get(filmId) ?? [];

    if (!film) {
      report.errors += 1;
      continue;
    }

    const yearHintClaim = filmClaims.find((claim) => claim.festival_year != null) ?? filmClaims[0];

    try {
      const presence = await verifyFilmFestivalPresence(
        film,
        festivalId,
        yearHintClaim ?? null,
        { presenceOnly: PRESENCE_ONLY_VERIFICATION }
      );

      if (presence.rateLimited) {
        report.blocked += 1;
        const pendingClaim = candidateToClaimRow(
          {
            festival_name: "Annecy International Animated Film Festival",
            festival_year: yearHintClaim?.festival_year ?? film.year ?? null,
            section: null,
            recognition_type: RECOGNITION_TYPE_POSSIBLE,
            award_name: null,
            source_type: String(yearHintClaim?.source_type ?? "ai_inference"),
            source_url: yearHintClaim?.source_url ?? null,
            original_text:
              yearHintClaim?.original_text ??
              "Awaiting official Annecy presence check.",
            evidence_status: "candidate_needs_review",
            acceptance_reason: presence.reason,
            importable: false,
          },
          film.id,
          {
            festivalId,
            verificationReason: presence.reason,
          }
        );

        if (!args.dryRun) {
          pendingClaim.claim_status = toPersistedClaimStatus(pendingClaim.claim_status);
          await upsertFilmFestivalClaims(supabase, film.id, [pendingClaim]);
        }

        report.verificationLog.push({
          film: film.title,
          tier: "rate_limited",
          claim_status: pendingClaim.claim_status,
          official_url: null,
          reason: presence.reason,
          recognitions_saved: 0,
        });

        console.log(`[verify] ${film.title}: rate_limited — skipping film (retry later)`);
        continue;
      }

      /** @type {Record<string, unknown>[]} */
      let savedRows = [];

      if (!PRESENCE_ONLY_VERIFICATION) {
        const importable = buildImportableRecognitions(presence.recognitions);

        if (presence.found && importable.length > 0 && !args.dryRun) {
          savedRows = await upsertFilmFestivalRecognitions(
            supabase,
            film.id,
            importable
          );
          report.savedRecognitions += savedRows.length;
        } else if (presence.found && importable.length > 0) {
          report.savedRecognitions += importable.length;
        }
      }

      const claimStatus = presence.found
        ? CLAIM_STATUSES.CONFIRMED_PRESENCE
        : CLAIM_STATUSES.NOT_AT_FESTIVAL;

      if (presence.found) {
        report.presenceConfirmed += 1;
      } else {
        report.notAtFestival += 1;
      }

      const updatedClaim = candidateToClaimRow(
        {
          festival_name: "Annecy International Animated Film Festival",
          festival_year: presence.festivalYear ?? yearHintClaim?.festival_year ?? film.year ?? null,
          section: null,
          recognition_type: RECOGNITION_TYPE_POSSIBLE,
          award_name: null,
          source_type: String(yearHintClaim?.source_type ?? "ai_inference"),
          source_url: yearHintClaim?.source_url ?? null,
          original_text:
            yearHintClaim?.original_text ??
            "Possible Annecy participation pending or not found on official archive.",
          evidence_status: presence.found ? "confirmed_official_source" : "candidate_needs_review",
          acceptance_reason: presence.reason,
          importable: false,
        },
        film.id,
        {
          festivalId,
          presenceConfirmed: presence.found,
          officialUrl: presence.officialUrl,
          verificationReason: presence.found
            ? presence.reason
            : "Official Annecy archive check: film not listed for tried festival years.",
        }
      );
      updatedClaim.claim_status = toPersistedClaimStatus(claimStatus);

      if (savedRows[0]?.id) {
        updatedClaim.recognition_id = String(savedRows[0].id);
      }

      if (!args.dryRun) {
        await upsertFilmFestivalClaims(supabase, film.id, [updatedClaim]);
      }

      report.verificationLog.push({
        film: film.title,
        at_annecy: presence.found ? "yes" : "no",
        claim_status: claimStatus,
        official_url: presence.officialUrl,
        festival_year: presence.festivalYear,
        reason: updatedClaim.verification_reason,
      });

      console.log(
        `[verify] ${film.title}: ${presence.found ? "YES at Annecy" : "NO"} (${claimStatus})${
          presence.officialUrl ? ` @ ${presence.officialUrl}` : ""
        }`
      );
    } catch (error) {
      report.errors += 1;
      console.error(`[verify-error] ${film.title}: ${formatError(error)}`);
    }
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  if (
    args.limit != null &&
    (!Number.isInteger(args.limit) || args.limit <= 0)
  ) {
    throw new Error("--limit must be a positive integer");
  }

  if (args.filmIds != null && args.filmIds.length === 0) {
    throw new Error("--film-ids requires at least one film id");
  }

  if (!["discovery", "verification", "full"].includes(args.phase)) {
    throw new Error("--phase must be discovery, verification, or full");
  }

  validateFestivalId(args.festivalId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  if (args.phase !== "verification" && !openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY (required for discovery phase)");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const openai =
    args.phase !== "verification"
      ? new OpenAI({ apiKey: openaiApiKey })
      : null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportBase = args.festivalId
    ? `festival-backfill-${args.festivalId}-${timestamp}`
    : `festival-backfill-${timestamp}`;

  /** @type {Record<string, unknown>} */
  const fullReport = {
    generatedAt: new Date().toISOString(),
    festivalId: args.festivalId,
    phase: args.phase,
    dryRun: args.dryRun,
  };

  if (args.phase === "discovery" || args.phase === "full") {
    fullReport.discovery = await runDiscoveryPhase(supabase, openai, args);
  }

  if (args.phase === "verification" || args.phase === "full") {
    fullReport.verification = await runVerificationPhase(supabase, args);
  }

  const totalFilms = await countCatalogFilms(supabase);
  const annecyClaims = args.festivalId === "annecy" || args.phase !== "discovery"
    ? await loadAnnecyClaimSummary(supabase, "annecy")
    : [];
  const confirmedRecognitions = await loadConfirmedRecognitions(supabase, "annecy");

  const claimStatusSummary = summarizeClaimStatuses(annecyClaims);
  const uniqueConfirmedRows = new Set(
    confirmedRecognitions.map((row) => row.dedupe_key)
  ).size;

  fullReport.summary = {
    totalCatalogFilms: totalFilms,
    annecyClaimsDiscovered: annecyClaims.length,
    annecyClaimsByStatus: claimStatusSummary,
    confirmedViaAnnecyOfficial: claimStatusSummary.confirmed ?? 0,
    unverifiedOrBlocked:
      (claimStatusSummary.discovered_unverified ?? 0) +
      (claimStatusSummary.blocked_or_incomplete ?? 0),
    rejectedNoEvidence: claimStatusSummary.rejected_after_verification ?? 0,
    uniqueConfirmedRecognitionRows: uniqueConfirmedRows,
    manualReviewFilms: [
      ...new Set(
        [
          ...(fullReport.discovery?.manualReviewFilms ?? []),
          ...(fullReport.verification?.manualReviewFilms ?? []),
        ].map((entry) => JSON.stringify(entry))
      ),
    ].map((entry) => JSON.parse(entry)),
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  const jsonPath = path.join(REPORTS_DIR, `${reportBase}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(fullReport, null, 2)}\n`);

  const csvRows = annecyClaims.map((claim) => ({
    film_id: claim.film_id,
    festival: claim.raw_festival_name,
    year: claim.festival_year ?? "",
    section: claim.section ?? "",
    award: claim.award_name ?? "",
    source_type: claim.source_type,
    source_url: claim.source_url ?? "",
    claim_status: claim.claim_status,
    official_url: claim.official_url ?? "",
    reason: claim.verification_reason ?? "",
  }));
  writeCsv(path.join(REPORTS_DIR, `${reportBase}-claims.csv`), csvRows);

  console.log("\n=== Final summary ===");
  console.log(`- total catalog films: ${fullReport.summary.totalCatalogFilms}`);
  console.log(`- Annecy claims discovered: ${fullReport.summary.annecyClaimsDiscovered}`);
  console.log(`- confirmed via annecyfestival.com: ${fullReport.summary.confirmedViaAnnecyOfficial}`);
  console.log(`- unverified / blocked: ${fullReport.summary.unverifiedOrBlocked}`);
  console.log(`- rejected (no Annecy evidence): ${fullReport.summary.rejectedNoEvidence}`);
  console.log(`- unique confirmed recognition rows: ${fullReport.summary.uniqueConfirmedRecognitionRows}`);
  console.log(`- manual review films: ${fullReport.summary.manualReviewFilms.length}`);
  console.log(`- JSON report: ${jsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
