/**
 * Controlled batch import for five recent 2026 films.
 *
 * This batch intentionally does not fetch or enrich anything. Post-import
 * enrichment is always skipped so this script cannot call after-films.
 *
 * Usage:
 *   node scripts/import-recent-films-2026-batch-1.mjs --check-only
 *   node scripts/import-recent-films-2026-batch-1.mjs --dry-run
 *   node scripts/import-recent-films-2026-batch-1.mjs --skip-enrichment
 */
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import {
  checkFilmDuplicates,
  formatDuplicateReport,
  insertFilmWithDuplicateCheck,
} from "../lib/insert-film.mjs";
import { runAfterFilmImport } from "../lib/run-after-film-import.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/** @type {Array<Record<string, unknown>>} */
const FILMS = [
  {
    title: "Decorado",
    original_title: "Decorado",
    year: 2026,
    director: "Alberto Vázquez",
    country: "Spain",
    duration_minutes: 95,
    technique: "drawing on paper, 2D computer animation",
    synopsis:
      "An unemployed mouse begins to suspect that his city is an artificial construction controlled by a powerful corporation and devises a plan to escape.",
    the_mood:
      "Bleak, surreal and darkly comic, with oppressive urban spaces, nervous energy and a growing sense that reality itself is closing in.",
  },
  {
    title: "In Waves",
    original_title: "In Waves",
    year: 2026,
    director: "Phuong Mai Nguyen",
    country: "France, Belgium",
    duration_minutes: 91,
    technique: "2D computer animation, 3D computer animation",
    synopsis:
      "A shy skateboarder falls in love with a passionate surfer, but their life together changes when she is diagnosed with a serious illness.",
    the_mood:
      "Tender and bittersweet, moving between sunlit coastal freedom, intimate romance and the quiet weight of grief and approaching loss.",
  },
  {
    title: "Lucy Lost",
    original_title: "Lucy Lost",
    year: 2026,
    director: "Olivier Clert",
    country: "France",
    duration_minutes: 89,
    technique: "2D computer animation",
    synopsis:
      "Rejected by the inhabitants of her isolated island village, a gifted young girl follows an invisible companion while searching for the source of her mysterious powers.",
    the_mood:
      "Gentle, windswept and mysterious, combining childlike wonder, coastal melancholy and a warm story about memory, belonging and identity.",
  },
  {
    title: "Tana",
    original_title: "Tana",
    year: 2026,
    director: "Ji Zhao, Ke Er Zhu",
    country: "China",
    duration_minutes: 111,
    technique: "3D computer animation",
    synopsis:
      "After being told that her music lacks soul, a young musician returns from Shanghai to the Inner Mongolian grasslands and reconnects with family, memory and home.",
    the_mood:
      "Expansive and lyrical, blending open grassland landscapes, musical fantasy and a reflective journey between modern ambition and cultural belonging.",
  },
  {
    title: "Tangles",
    original_title: "Tangles",
    year: 2026,
    director: "Leah Nelson",
    country: "Canada, USA",
    duration_minutes: 102,
    technique: "2D computer animation",
    synopsis:
      "A young woman returns to care for her mother as Alzheimer’s changes their relationship, while confronting her own identity, family history and grief.",
    the_mood:
      "Intimate, warm and painful, balancing domestic humour with the confusion, tenderness and gradual loss that reshape a family facing Alzheimer’s disease.",
  },
];

function parseArgs(argv) {
  return {
    checkOnly: argv.includes("--check-only"),
    dryRun: argv.includes("--dry-run"),
    skipEnrichment: argv.includes("--skip-enrichment"),
  };
}

function filmIdentity(film) {
  return {
    title: film.title,
    original_title: film.original_title ?? null,
    director: film.director ?? null,
    year: film.year ?? null,
    country: film.country ?? null,
    tmdb_id: null,
    imdb_id: null,
  };
}

async function checkDuplicates(film) {
  const { matches, incomingFilm } = await checkFilmDuplicates(
    supabase,
    filmIdentity(film)
  );

  if (matches.length > 0) {
    throw new Error(
      `Duplicate check failed for "${film.title}":\n${formatDuplicateReport({
        matches,
        incomingFilm,
      })}`
    );
  }

  return matches;
}

function buildInsertPayload(film) {
  return {
    title: film.title,
    original_title: film.original_title,
    year: film.year,
    director: film.director,
    country: film.country,
    duration_minutes: film.duration_minutes,
    technique: film.technique,
    synopsis: film.synopsis,
    the_mood: film.the_mood,
    // Deliberately omitted: festival data, image/trailer URLs, external IDs,
    // moods, themes, aesthetic_tags, narrative_tags, and what_it_is.
  };
}

async function processFilm(film, { checkOnly, dryRun }) {
  await checkDuplicates(film);

  if (checkOnly) {
    console.log(`[check-only] ${film.title}: no duplicate found`);
    return { title: film.title, status: "checked", id: null };
  }

  const payload = buildInsertPayload(film);

  if (dryRun) {
    console.log(`[dry-run] ${film.title}: would insert`);
    console.log(JSON.stringify(payload, null, 2));
    return { title: film.title, status: "dry-run", id: null };
  }

  const result = await insertFilmWithDuplicateCheck(supabase, payload);

  if (!result.inserted) {
    throw new Error(
      `Insert blocked for "${film.title}": ${
        result.reason ?? "unknown reason"
      }\n${formatDuplicateReport({
        matches: result.matches ?? [],
        incomingFilm: result.incomingFilm ?? filmIdentity(film),
      })}`
    );
  }

  // Keep the existing post-import mechanism explicitly disabled. This batch
  // must never invoke after-films, even if --skip-enrichment is omitted.
  runAfterFilmImport(result.film.id, { skip: true });

  console.log(`[inserted] ${film.title}: ${result.film.id}`);
  return { title: film.title, status: "inserted", id: result.film.id };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.checkOnly && args.dryRun) {
    throw new Error("Use either --check-only or --dry-run, not both.");
  }

  if (args.skipEnrichment) {
    console.log("Post-import enrichment disabled (--skip-enrichment).");
  } else {
    console.log(
      "Post-import enrichment is disabled for this controlled batch by design."
    );
  }

  /** @type {Array<{ title: string, status: string, id: string | null }>} */
  const results = [];

  for (const film of FILMS) {
    try {
      results.push(await processFilm(film, args));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ title: film.title, status: "failed", id: null });
      console.error(`[stopped] ${film.title}: ${message}`);
      console.error(
        `Batch stopped before processing the remaining films. Processed: ${results.length}/${FILMS.length}.`
      );
      process.exitCode = 1;
      break;
    }
  }

  console.log("\nBatch summary:");
  for (const result of results) {
    console.log(
      `- ${result.title}: ${result.status}${result.id ? ` — ${result.id}` : ""}`
    );
  }
  console.log(
    `Processed: ${results.length}/${FILMS.length}; order: ${FILMS.map(
      (film) => film.title
    ).join(" → ")}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
