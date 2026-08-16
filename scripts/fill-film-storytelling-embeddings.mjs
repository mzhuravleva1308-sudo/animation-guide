import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { MEDIA_TYPE } from "../lib/media-type.mjs";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!openaiApiKey) throw new Error("Missing OPENAI_API_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });
const scope = parseFilmScopeArgs(process.argv.slice(2));
const dryRun = scope.passthrough.includes("--dry-run");

function normalizeTag(tag) {
  return tag.trim().toLowerCase();
}

function buildStorytellingText(film) {
  const tags = (film.storytelling_tags ?? [])
    .map(normalizeTag)
    .filter(Boolean)
    .sort();
  return `live-action film storytelling: ${tags.join(", ")}`;
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

async function getFilms() {
  return loadScopedFilms(supabase, scope, {
    select: "id, title, storytelling_tags, media_type",
    applyFilters: (query) =>
      query
        .eq("media_type", MEDIA_TYPE.liveAction)
        .not("storytelling_tags", "is", null)
        .order("title"),
  }).then((films) => films.filter((film) => film.storytelling_tags?.length));
}

async function getExistingEmbeddings() {
  const { data, error } = await supabase
    .from("film_storytelling_embeddings")
    .select("film_id, storytelling_text, embedding");
  if (error) throw error;

  const map = new Map();
  for (const row of data ?? []) {
    map.set(row.film_id, {
      text: row.storytelling_text,
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
  const films = await getFilms();
  const existingById = await getExistingEmbeddings();

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(`Films with storytelling tags: ${films.length}`);

  for (const film of films) {
    const text = buildStorytellingText(film);
    const existing = existingById.get(film.id);

    if (existing?.text === text && existing.valid) {
      console.log(`Embedding exists: ${film.title}`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would create storytelling embedding: ${film.title}`);
      console.log(`  ${text}`);
      continue;
    }

    console.log(`Creating storytelling embedding: ${film.title}`);
    console.log(`  ${text}`);
    const embedding = await createEmbedding(text);

    const { error } = await supabase.from("film_storytelling_embeddings").upsert(
      {
        film_id: film.id,
        storytelling_text: text,
        embedding,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "film_id" }
    );
    if (error) throw error;
  }

  console.log("\nDone");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
