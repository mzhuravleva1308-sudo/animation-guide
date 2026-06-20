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
  const { data, error } = await supabase
    .from("films")
    .select("id, title, moods)
    .not("moods", "is", null)
    .order("title");

  if (error) throw error;

  return (data ?? []).filter((film) => film.moods?.length);
}

async function getExistingFilmEmbeddings() {
  const { data, error } = await supabase
    .from("film_mood_embeddings")
    .select("film_id, mood_text");

  if (error) throw error;

  const map = new Map();

  for (const row of data ?? []) {
    map.set(row.film_id, row.mood_text);
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
  const existing = await getExistingFilmEmbeddings();

  console.log(`Films with moods: ${films.length}`);

  for (const film of films) {
    const moodText = buildMoodText(film);
    const existingMoodText = existing.get(film.id);

    if (existingMoodText === moodText) {
      console.log(`Embedding exists: ${film.title}`);
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});