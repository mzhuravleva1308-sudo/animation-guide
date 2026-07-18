import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";

applyAppEnv();

const scope = parseFilmScopeArgs(process.argv.slice(2));
const dryRun = scope.passthrough.includes("--dry-run");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

if (!openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

function normalizeMood(mood) {
  return mood.trim().toLowerCase();
}

function buildMoodText(film) {
  const moods = (film.moods ?? [])
    .map(normalizeMood)
    .filter(Boolean)
    .sort();

  return `animated film emotional atmosphere: ${moods.join(", ")}`;
}

async function getFilms() {
  return loadScopedFilms(supabase, scope, {
    select: "id, title, moods",
    applyFilters: (query) => query.not("moods", "is", null).order("title"),
  });
}

function isValidEmbedding(value) {
  const expectedDimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS);
  const vector = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.replace(/^\[/, "").replace(/\]$/, "").split(",").map(Number)
      : null;

  return (
    Array.isArray(vector) &&
    vector.length > 0 &&
    vector.every(Number.isFinite) &&
    (!Number.isInteger(expectedDimensions) ||
      expectedDimensions <= 0 ||
      vector.length === expectedDimensions)
  );
}

async function getExistingFilmEmbeddings() {
  const { data, error } = await supabase
    .from("film_mood_embeddings")
    .select("film_id, mood_text, embedding");

  if (error) throw error;

  const map = new Map();

  for (const row of data ?? []) {
    map.set(row.film_id, {
      moodText: row.mood_text,
      valid: isValidEmbedding(row.embedding),
    });
  }

  return map;
}

async function createEmbedding(input) {
  const response = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    input,
  });

  return response.data[0].embedding;
}

async function main() {
  const films = (await getFilms()).filter((film) => film.moods?.length);
  const existingById = await getExistingFilmEmbeddings();

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(`Films with moods: ${films.length}`);

  for (const film of films) {
    const moodText = buildMoodText(film);
    const existing = existingByFilmId(existingById, film.id);

    if (existing?.moodText === moodText && existing.valid) {
      console.log(`Embedding exists: ${film.title}`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would create embedding: ${film.title}`);
      console.log(`  film_id: ${film.id}`);
      console.log(`  ${moodText}`);
      continue;
    }

    console.log(`Creating film mood embedding: ${film.title}`);
    console.log(`  ${moodText}`);

    const embedding = await createEmbedding(moodText);

    const { error } = await supabase
      .from("film_mood_embeddings")
      .upsert(
        {
          film_id: film.id,
          mood_text: moodText,
          embedding,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "film_id",
        }
      );

    if (error) throw error;
  }

  console.log("\nDone");
}

function existingByFilmId(map, filmId) {
  return map.get(filmId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});