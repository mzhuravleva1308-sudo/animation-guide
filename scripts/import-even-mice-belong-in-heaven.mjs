/**
 * One-off catalog import for Even Mice Belong in Heaven (2021).
 *
 * Usage:
 *   node scripts/import-even-mice-belong-in-heaven.mjs [--dry-run]
 *   node scripts/import-even-mice-belong-in-heaven.mjs --check-only
 */
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import {
  checkFilmDuplicates,
  formatDuplicateReport,
  insertFilmWithDuplicateCheck,
} from "../lib/insert-film.mjs";
import { validateEditorialCopy } from "../lib/film-editorial-copy.mjs";
import { runAfterFilmImport } from "../lib/run-after-film-import.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/** @type {Record<string, unknown>} */
const FILM = {
  title: "Even Mice Belong in Heaven",
  original_title: "Myši patří do nebe",
  director: "Denisa Grimmová, Jan Bubeníček",
  year: 2021,
  country: "Czech Republic, France, Poland, Slovakia",
  duration_minutes: 87,
  synopsis:
    "After a fatal accident, a feisty mouse named Whizzy and a shy fox cub named Whitebelly meet in animal heaven, where predator and prey must learn to trust each other on a journey through the afterlife toward rebirth.",
  technique: "stop motion, puppet animation",
  moods: [
    "tender",
    "bittersweet",
    "hopeful",
    "gentle",
    "melancholic",
    "warm",
  ],
  themes: [
    "friendship",
    "death",
    "afterlife",
    "grief",
    "courage",
    "childhood fear",
  ],
  aesthetic_tags: [
    "handmade puppetry",
    "tactile textures",
    "miniature world",
    "storybook-like",
    "organic materials",
    "delicate craftsmanship",
  ],
  narrative_tags: [
    "character-driven",
    "meditative journey",
    "transformation arc",
    "world discovery",
    "emotional layered",
    "quiet character study",
  ],
  dialogue: "has_dialogue",
  emotional_intensity: 4,
  weirdness: 3,
  kid_safety: "maybe",
  what_it_is:
    "A mouse named Whizzy and a fox cub named Whitebelly die in an accident and travel through animal heaven, where their old predator-prey roles fall away.",
  the_mood:
    "Tender and bittersweet, with puppet textures and an afterlife world that holds room for grief, fear, and renewed courage.",
  source_url: "https://www.micebelonginheaven.com/",
  watch_url: "https://www.micebelonginheaven.com/",
  availability: "unknown",
  status: "want_to_watch",
  imdb_id: "tt3804810",
  tmdb_id: 588890,
  festival: "Annecy International Animated Film Festival",
  section: "Screening Event",
  cold_start_note:
    "Sources: micebelonginheaven.com (official production page), KVIFF 2021 programme, Filmový přehled (Czech national film database). Runtime 87 min from KVIFF/official site; TMDB lists 80 min.",
};

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    checkOnly: argv.includes("--check-only"),
    skipEnrichment: argv.includes("--skip-enrichment"),
  };
}

async function main() {
  const { dryRun, checkOnly, skipEnrichment } = parseArgs(process.argv.slice(2));

  const editorialValidation = validateEditorialCopy({
    what_it_is: FILM.what_it_is,
    the_mood: FILM.the_mood,
  });

  if (!editorialValidation.ok) {
    throw new Error(
      `Editorial copy validation failed: ${editorialValidation.issues.join("; ")}`
    );
  }

  const incoming = {
    title: String(FILM.title),
    original_title: FILM.original_title,
    director: FILM.director,
    year: FILM.year,
    country: FILM.country,
    imdb_id: FILM.imdb_id,
    tmdb_id: FILM.tmdb_id,
  };

  const { matches, incomingFilm } = await checkFilmDuplicates(supabase, incoming);

  console.log(`Duplicate check: ${matches.length} match(es)`);
  if (matches.length) {
    console.log(formatDuplicateReport({ matches, incomingFilm }));
    throw new Error("Duplicate check failed — aborting import.");
  }

  const altTitleQueries = [
    "mice%heaven",
    "my%i%pat%",
    "my%aci%pat%",
    "i%my%aci%pat%",
  ];

  for (const pattern of altTitleQueries) {
    const { data, error } = await supabase
      .from("films")
      .select("id, title, original_title, year")
      .or(`title.ilike.%${pattern}%,original_title.ilike.%${pattern}%`);

    if (error) {
      throw error;
    }

    if (data?.length) {
      console.error("Alternative title search found possible matches:", data);
      throw new Error("Alternative title duplicate search failed — aborting import.");
    }
  }

  console.log("Alternative title search: no matches.");

  if (checkOnly) {
    console.log("Check-only mode — duplicate checks passed.");
    return;
  }

  if (dryRun) {
    console.log("Dry run — would insert film:", JSON.stringify(FILM, null, 2));
    return;
  }

  const result = await insertFilmWithDuplicateCheck(supabase, FILM);

  if (!result.inserted) {
    throw new Error(
      `Insert blocked: ${result.reason ?? "unknown"} — ${formatDuplicateReport({
        matches: result.matches ?? [],
        incomingFilm: result.incomingFilm ?? incoming,
      })}`
    );
  }

  console.log("Inserted film:", result.film.id, result.film.title);
  console.log(JSON.stringify({ id: result.film.id, title: result.film.title }, null, 2));

  runAfterFilmImport(result.film.id, { skip: skipEnrichment });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
