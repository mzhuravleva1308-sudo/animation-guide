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

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeMood(mood) {
  return mood.trim().toLowerCase();
}

async function getUniqueMoods() {
  const { data, error } = await supabase
    .from("films")
    .select("moods")
    .not("moods", "is", null);

  if (error) {
    throw error;
  }

  const moodSet = new Set();

  for (const film of data ?? []) {
    for (const mood of film.moods ?? []) {
      const normalized = normalizeMood(mood);

      if (normalized) {
        moodSet.add(normalized);
      }
    }
  }

  return Array.from(moodSet).sort();
}

async function getExistingEmbeddings() {
  const { data, error } = await supabase
    .from("mood_embeddings")
    .select("mood, embedding");

  if (error) {
    throw error;
  }

  const map = new Map();

  for (const row of data ?? []) {
    map.set(row.mood, row.embedding);
  }

  return map;
}

async function createEmbedding(mood) {
  const input = `animation film mood: ${mood}`;

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });

  return response.data[0].embedding;
}

async function fillEmbeddings(moods, existingEmbeddings) {
  const embeddings = new Map(existingEmbeddings);

  for (const mood of moods) {
    if (embeddings.has(mood)) {
      console.log(`Embedding exists: ${mood}`);
      continue;
    }

    console.log(`Creating embedding: ${mood}`);

    const embedding = await createEmbedding(mood);

    const { error } = await supabase.from("mood_embeddings").upsert({
      mood,
      embedding,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    embeddings.set(mood, embedding);
  }

  return embeddings;
}

async function fillDistances(moods, embeddings) {
  const rows = [];

  for (const moodA of moods) {
    for (const moodB of moods) {
      const embeddingA = embeddings.get(moodA);
      const embeddingB = embeddings.get(moodB);

      if (!embeddingA || !embeddingB) {
        continue;
      }

      const similarity = cosineSimilarity(embeddingA, embeddingB);
      const distance = 1 - similarity;

      rows.push({
        mood_a: moodA,
        mood_b: moodB,
        similarity,
        distance,
        updated_at: new Date().toISOString(),
      });
    }
  }

  console.log(`Upserting ${rows.length} mood distances...`);

  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await supabase
      .from("mood_distances")
      .upsert(batch, {
        onConflict: "mood_a,mood_b",
      });

    if (error) {
      throw error;
    }

    console.log(`Saved ${Math.min(i + batchSize, rows.length)} / ${rows.length}`);
  }
}

async function main() {
  const moods = await getUniqueMoods();

  console.log(`Found ${moods.length} unique moods`);

  const existingEmbeddings = await getExistingEmbeddings();
  const embeddings = await fillEmbeddings(moods, existingEmbeddings);

  await fillDistances(moods, embeddings);

  console.log("Done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});