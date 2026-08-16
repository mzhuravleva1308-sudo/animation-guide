/**
 * Import curated live-action major festival participation to hosted
 * film_festival_claims (confirmed). Does not touch awards.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/import-la-festival-claims.mjs [--dry-run] [--file path]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  CLAIM_STATUSES,
  upsertFilmFestivalClaims,
} from "../lib/film-festival-claim.mjs";
import { matchResonaleMajorFestival } from "../lib/resonale-major-festivals.mjs";
import { resolveFestivalBadgeId } from "../lib/festival-badge.ts";

applyAppEnv({ mode: "hosted" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(
  __dirname,
  "..",
  "tmp",
  "la-festivals-cleaned.txt"
);
const IMPORT_SOURCE = "manual_verified_la_festivals_v1";

function parseArgs(args) {
  const fileIdx = args.indexOf("--file");
  return {
    dryRun: args.includes("--dry-run"),
    file:
      fileIdx === -1
        ? DEFAULT_FILE
        : path.resolve(String(args[fileIdx + 1] ?? DEFAULT_FILE)),
  };
}

function normalizeTitleKey(title) {
  return String(title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’ʻʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} text
 */
function parseCleanedList(text) {
  /** @type {{ title: string, year: number, festivals: { name: string, year: number | null }[] }[]} */
  const entries = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("A–") || line.startsWith("D–") || /^[A-Z]–[A-Z]$/.test(line) || /^[A-Z]$/.test(line) || line.startsWith("I–") || line.startsWith("N–") || line.startsWith("U–") || line === "S" || line === "T") {
      continue;
    }

    const cleaned = line.replace(/^\*\s*/, "").trim();
    const match = cleaned.match(/^(.+?)\s+\((\d{4})\)\s+[—–-]\s+(.+)$/);
    if (!match) {
      console.warn(`[skip line] ${line}`);
      continue;
    }

    const title = match[1].trim();
    const year = Number.parseInt(match[2], 10);
    const festivals = match[3]
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const festMatch = part.match(/^(.+?)\s+\((\d{4})\)$/);
        if (!festMatch) {
          return { name: part, year: null };
        }
        return {
          name: festMatch[1].trim(),
          year: Number.parseInt(festMatch[2], 10),
        };
      });

    entries.push({ title, year, festivals });
  }

  return entries;
}

/**
 * @param {{ name: string, year: number | null }} fest
 */
function toClaimRow(fest) {
  const matched = matchResonaleMajorFestival(fest.name);
  if (!matched) {
    throw new Error(`Not a Resonale major festival: ${fest.name}`);
  }

  const badgeId = resolveFestivalBadgeId(matched.id) ?? resolveFestivalBadgeId(fest.name);
  if (!badgeId) {
    throw new Error(`No festival badge mapping for: ${fest.name} (${matched.id})`);
  }

  return {
    raw_festival_name: matched.name,
    canonical_festival_id: matched.id,
    festival_year: fest.year,
    section: null,
    recognition_type: "official_selection",
    award_name: null,
    award_result: null,
    source_type: "manual_curated",
    source_url: null,
    original_text: `${matched.name}${fest.year ? ` (${fest.year})` : ""}`,
    claim_status: CLAIM_STATUSES.CONFIRMED,
    verification_reason:
      "Manually curated live-action major festival participation.",
    official_url: null,
    discovery_source: IMPORT_SOURCE,
    dedupe_key: `${matched.id}|official_selection|${fest.year ?? "unknown"}|manual_la`,
    recognition_id: null,
  };
}

const args = parseArgs(process.argv.slice(2));
const text = await fs.readFile(args.file, "utf8");
const entries = parseCleanedList(text);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const { data: films, error } = await supabase
  .from("films")
  .select("id, title, year, media_type, catalog_visible")
  .eq("media_type", "live_action");

if (error) throw error;

/** @type {Map<string, { id: string, title: string, year: number | null }[]>} */
const byKey = new Map();
for (const film of films ?? []) {
  const key = `${normalizeTitleKey(film.title)}|${film.year ?? ""}`;
  const bucket = byKey.get(key) ?? [];
  bucket.push(film);
  byKey.set(key, bucket);
}

let matched = 0;
let missing = 0;
let claimRows = 0;
let saved = 0;
/** @type {string[]} */
const missingTitles = [];
/** @type {string[]} */
const badgePreview = [];

for (const entry of entries) {
  const key = `${normalizeTitleKey(entry.title)}|${entry.year}`;
  const hits = byKey.get(key) ?? [];
  if (hits.length === 0) {
    missing += 1;
    missingTitles.push(`${entry.title} (${entry.year})`);
    continue;
  }
  if (hits.length > 1) {
    console.warn(`[ambiguous] ${entry.title} (${entry.year}) → ${hits.length} rows`);
  }

  const film = hits[0];
  matched += 1;

  const claims = entry.festivals.map((fest) => toClaimRow(fest));
  claimRows += claims.length;

  const labels = [
    ...new Set(
      claims
        .map((c) => resolveFestivalBadgeId(c.canonical_festival_id))
        .filter(Boolean)
    ),
  ];
  if (badgePreview.length < 8) {
    badgePreview.push(
      `${film.title} (${film.year}): ${labels.join(", ")}`
    );
  }

  if (args.dryRun) {
    continue;
  }

  await upsertFilmFestivalClaims(supabase, film.id, claims);
  saved += 1;
}

console.log(
  JSON.stringify(
    {
      dryRun: args.dryRun,
      entries: entries.length,
      matched,
      missing,
      claimRows,
      savedFilms: saved,
      missingTitles: missingTitles.slice(0, 30),
      badgePreview,
    },
    null,
    2
  )
);

if (missingTitles.length) {
  console.error(`Missing ${missingTitles.length} films (showing up to 30).`);
  process.exitCode = 1;
}
