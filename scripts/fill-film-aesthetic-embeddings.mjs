import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

applyAppEnv();

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

function normalizeTag(tag) {
  return tag.trim().toLowerCase();
}

function buildAestheticText(film) {
  const aestheticTags = (film.aesthetic_tags ?? [])
    .map(normalizeTag)
    .filter(Boolean)
    .sort();

  return `animated film aesthetic and material feeling: ${aestheticTags.join(
    ", "
  )}`;
}

async function getFilms() {
  const { data, error } = await supabase
    .from("films")
    .select("id, title, aesthetic_tags")
    .not("aesthetic_tags", "is", null)
    .order("title");

  if (error) throw error;

  return (data ?? []).filter((film) => film.aesthetic_tags?.length);
}

async function getExistingEmbeddings() {
  const { data, error } = await supabase
    .from("film_aesthetic_embeddings")
    .select("film_id, aesthetic_text");

  if (error) throw error;

  const map = new Map();

  for (const row of data ?? []) {
    map.set(row.film_id, row.aesthetic_text);
  }

  return map;
}

async function createEmbedding(input) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });

  return response.data[0].embedding;
}

async function main() {
  const films = await getFilms();
  const existing = await getExistingEmbeddings();

  console.log(`Films with aesthetic tags: ${films.length}`);

  for (const film of films) {
    const aestheticText = buildAestheticText(film);
    const existingText = existing.get(film.id);

    if (existingText === aestheticText) {
      console.log(`Embedding exists: ${film.title}`);
      continue;
    }

    console.log(`Creating aesthetic embedding: ${film.title}`);
    console.log(`  ${aestheticText}`);

    const embedding = await createEmbedding(aestheticText);

    const { error } = await supabase
      .from("film_aesthetic_embeddings")
      .upsert(
        {
          film_id: film.id,
          aesthetic_text: aestheticText,
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});