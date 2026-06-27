/**
 * Complete catalog metadata for The Painting (Le Tableau, 2011).
 * Updates the existing row — duplicate check confirmed this film is already present.
 *
 * Usage:
 *   node scripts/enrich-the-painting.mjs [--dry-run]
 *   node scripts/enrich-the-painting.mjs --check-only
 */
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import {
  checkFilmDuplicates,
  formatDuplicateReport,
} from "../lib/insert-film.mjs";
import { validateEditorialCopy } from "../lib/film-editorial-copy.mjs";
import { runAfterFilmImport } from "../lib/run-after-film-import.mjs";

applyAppEnv();

const FILM_ID = "8c705ad1-f218-4921-b1c4-0d38a027d857";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/** @type {Record<string, unknown>} */
const UPDATES = {
  title: "The Painting",
  original_title: "Le Tableau",
  director: "Jean-François Laguionie",
  year: 2011,
  country: "France, Belgium",
  duration_minutes: 76,
  synopsis:
    "In an unfinished painting, fully colored Toupins, partly colored Pafinis, and sketch-only Reufs live under unequal rules. Ramo, Lola, and Plume leave the canvas to find the Painter and ask why their world was abandoned.",
  technique: "hand-drawn 2D animation",
  moods: [
    "poetic",
    "gentle",
    "dreamy",
    "bittersweet",
    "hopeful",
    "intimate",
    "contemplative",
  ],
  themes: [
    "art",
    "identity",
    "class division",
    "unfinished worlds",
    "imagination",
    "creator and creation",
  ],
  aesthetic_tags: [
    "painterly",
    "storybook-like",
    "surreal",
    "color-rich",
    "unfinished canvas",
    "textured layers",
    "fluid forms",
  ],
  narrative_tags: [
    "quest-driven",
    "world discovery",
    "character-driven",
    "philosophical fable",
    "transformation arc",
    "emotional layered",
    "strange world discovery",
  ],
  dialogue: "has_dialogue",
  emotional_intensity: 3,
  weirdness: 3,
  kid_safety: "maybe",
  what_it_is:
    "Ramo, Lola, and Plume slip out of an unfinished painting and travel through other canvases, searching for the Painter who left their chateau incomplete.",
  the_mood:
    "Color-rich and measured, with tactile painted surfaces and a growing tension around class lines inside unfinished worlds.",
  source_url: "https://en.unifrance.org/movie/32398/the-painting",
  watch_url: "https://www.gebekafilms.com/",
  availability: "unknown",
  imdb_id: "tt1891769",
  tmdb_id: 98162,
  festival: "Annecy International Animated Film Festival",
  section: "Feature Films",
  cold_start_note:
    "Sources: Unifrance (official French export database), Blue Spirit production page, IMDb awards. Runtime 76 min from Unifrance; TMDB lists 80 min. Production uses painterly CG animation (Blue Spirit/BE-Films); raw technique stored as hand-drawn 2D animation per catalog convention.",
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
    what_it_is: UPDATES.what_it_is,
    the_mood: UPDATES.the_mood,
  });

  if (!editorialValidation.ok) {
    throw new Error(
      `Editorial copy validation failed: ${editorialValidation.issues.join("; ")}`
    );
  }

  const incoming = {
    title: String(UPDATES.title),
    original_title: UPDATES.original_title,
    director: UPDATES.director,
    year: UPDATES.year,
    country: UPDATES.country,
    imdb_id: UPDATES.imdb_id,
    tmdb_id: UPDATES.tmdb_id,
  };

  const { matches, incomingFilm } = await checkFilmDuplicates(supabase, incoming);
  const selfMatch = matches.filter((match) => match.existingFilm.id === FILM_ID);
  const otherMatches = matches.filter((match) => match.existingFilm.id !== FILM_ID);

  console.log(`Duplicate check: ${matches.length} match(es), ${otherMatches.length} blocking`);
  if (otherMatches.length) {
    console.log(formatDuplicateReport({ matches: otherMatches, incomingFilm }));
    throw new Error("Unexpected duplicate besides the canonical row — aborting.");
  }

  if (selfMatch.length) {
    console.log("Confirmed existing canonical row for The Painting (2011).");
  }

  for (const pattern of ["tableau", "painting"]) {
    const { data, error } = await supabase
      .from("films")
      .select("id, title, original_title, year, director")
      .or(`title.ilike.%${pattern}%,original_title.ilike.%${pattern}%`);

    if (error) {
      throw error;
    }

    const foreign = (data ?? []).filter((row) => row.id !== FILM_ID);
    if (foreign.length) {
      console.error("Alternative title search found extra matches:", foreign);
      throw new Error("Alternative title duplicate search failed.");
    }
  }

  console.log("Alternative title search: single canonical row only.");

  const { data: existing, error: existingError } = await supabase
    .from("films")
    .select("id, title")
    .eq("id", FILM_ID)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!existing) {
    throw new Error(`Expected film row ${FILM_ID} not found.`);
  }

  if (checkOnly) {
    console.log("Check-only mode — duplicate checks passed.");
    return;
  }

  if (dryRun) {
    console.log("Dry run — would update film:", JSON.stringify(UPDATES, null, 2));
    return;
  }

  const { data, error } = await supabase
    .from("films")
    .update(UPDATES)
    .eq("id", FILM_ID)
    .select("id, title, technique, imdb_id, tmdb_id, poster_url, source_url")
    .single();

  if (error) {
    throw error;
  }

  console.log("Updated film:", JSON.stringify(data, null, 2));

  runAfterFilmImport(FILM_ID, { skip: skipEnrichment });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
