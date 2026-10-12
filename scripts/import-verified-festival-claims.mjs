/**
 * Import verified Resonale-major festival participation into film_festival_claims.
 *
 *   APP_ENV=hosted node scripts/import-verified-festival-claims.mjs <path-to-json> [--dry-run]
 *
 * JSON: [{ title, year, claims: [{ festival_name, festival_year, section?, source_url? }] }]
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  CLAIM_STATUSES,
  upsertFilmFestivalClaims,
} from "../lib/film-festival-claim.mjs";
import { matchResonaleMajorFestival } from "../lib/resonale-major-festivals.mjs";

applyAppEnv({ mode: "hosted" });

const IMPORT_SOURCE = "manual_verified_festival_claims_v1";

const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!filePath) {
  console.error(
    "Usage: APP_ENV=hosted node scripts/import-verified-festival-claims.mjs <path-to-json> [--dry-run]"
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
if (!Array.isArray(payload)) {
  console.error("Payload must be an array");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeTitleKey(title) {
  return String(title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’ʻʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

let matched = 0;
let missing = 0;
let saved = 0;
let skippedFestival = 0;

for (const [index, entry] of payload.entries()) {
  const title = entry?.title;
  const year = entry?.year;
  const { data: films, error } = await supabase
    .from("films")
    .select("id, title, year")
    .eq("title", title)
    .eq("year", year);
  if (error) throw error;

  const film =
    (films ?? []).find(
      (row) =>
        normalizeTitleKey(row.title) === normalizeTitleKey(title) &&
        row.year === year
    ) ?? films?.[0];

  if (!film?.id) {
    missing += 1;
    console.warn(`[skip] entry ${index}: film not found — ${title} (${year})`);
    continue;
  }
  matched += 1;

  /** @type {object[]} */
  const claimRows = [];
  for (const claim of entry.claims ?? []) {
    const matchedFest = matchResonaleMajorFestival(claim.festival_name, claim);
    if (!matchedFest) {
      skippedFestival += 1;
      console.warn(
        `[skip festival] ${title}: not Resonale major — ${claim.festival_name}`
      );
      continue;
    }
    const yearPart = claim.festival_year ?? "unknown";
    const sectionPart = String(claim.section ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    claimRows.push({
      film_id: film.id,
      raw_festival_name: matchedFest.name,
      canonical_festival_id: matchedFest.id,
      festival_year: claim.festival_year ?? null,
      section: claim.section ?? null,
      recognition_type: "official_selection",
      award_name: null,
      award_result: null,
      source_type: "manual_curated",
      source_url: claim.source_url ?? null,
      original_text: `${matchedFest.name}${
        claim.festival_year ? ` (${claim.festival_year})` : ""
      }${claim.section ? ` — ${claim.section}` : ""}`,
      claim_status: CLAIM_STATUSES.CONFIRMED,
      verification_reason:
        "Manually verified Resonale major festival participation.",
      official_url: claim.source_url ?? null,
      discovery_source: IMPORT_SOURCE,
      dedupe_key: `${matchedFest.id}|official_selection|${yearPart}|${sectionPart || "main"}|manual_v1`,
      recognition_id: null,
    });
  }

  if (!claimRows.length) continue;

  if (dryRun) {
    console.log(
      `[dry-run] ${title}: ${claimRows
        .map((row) => `${row.canonical_festival_id} ${row.festival_year}`)
        .join("; ")}`
    );
    continue;
  }

  const upserted = await upsertFilmFestivalClaims(supabase, film.id, claimRows);
  saved += upserted.length;
  console.log(`[saved] ${title}: ${upserted.length} claims`);
}

console.log("\n=== Verified festival claims import summary ===");
console.log({ matched, missing, saved, skippedFestival, dryRun });
