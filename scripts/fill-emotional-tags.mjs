import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

const BATCH_LIMIT = 500;

function normalizeTag(tag) {
  return String(tag ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function getFilms() {
  const { data, error } = await supabase
    .from("films")
    .select(
      "id, title, original_title, director, year, country, synopsis, technique, moods, themes, aesthetic_tags"
    )
    .order("title")
    .limit(BATCH_LIMIT);

  if (error) throw error;

  return data ?? [];
}

async function generateEmotionalTags(film) {
  const prompt = `
You are tagging animated films for a personal recommendation system.

Generate 4 to 7 emotional / sensory mood tags for this animated film.

These tags should describe how the film feels emotionally or psychologically:
- melancholic
- tender
- lonely
- bittersweet
- eerie
- anxious
- warm
- poetic
- unsettling
- gentle
- playful
- sad
- strange
- hopeful
- intimate
- bleak
- whimsical
- dreamy

Important:
- Use lower-case English tags only.
- Return only JSON: {"moods":["tag one","tag two"]}
- Do NOT include visual/material/aesthetic/technique tags.
- Avoid: tactile, handmade, painterly, textured, stylized, visual, cutout, puppet, puppetry, clay, stop-motion, digital, collage, miniature, organic materials, craftsmanship, linework, color, design, 2d animation, 3d animation.
- Avoid themes that are not emotional states, such as: historical, familial, political, ecological, friendship, family, war, memory, society.
- Tags can be sensory-emotional, but not material. For example "eerie", "claustrophobic", "dreamlike" are OK; "tactile", "textured", "handmade" are not.

Film:
Title: ${film.title}
Original title: ${film.original_title ?? ""}
Director: ${film.director ?? ""}
Year: ${film.year ?? ""}
Country: ${film.country ?? ""}
Synopsis: ${film.synopsis ?? ""}
Technique: ${film.technique ?? ""}
Themes: ${(film.themes ?? []).join(", ")}
Current moods: ${(film.moods ?? []).join(", ")}
Aesthetic tags to keep separate, do not copy into moods: ${(film.aesthetic_tags ?? []).join(", ")}
`.trim();

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You create clean emotional mood tags for animated film recommendations. You return strict JSON only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error(`No response for ${film.title}`);
  }

  const parsed = JSON.parse(content);

  const moods = Array.from(
    new Set((parsed.moods ?? []).map(normalizeTag).filter(Boolean))
  ).slice(0, 7);

  return moods;
}

async function updateFilm(film, moods) {
  const { error } = await supabase
    .from("films")
    .update({ moods })
    .eq("id", film.id);

  if (error) throw error;
}

async function main() {
  const films = await getFilms();

  console.log(`Found ${films.length} films`);

  for (const film of films) {
    try {
      const moods = await generateEmotionalTags(film);

      console.log(`${film.title}: ${moods.join(", ")}`);

      await updateFilm(film, moods);
    } catch (error) {
      console.error(`Failed: ${film.title}`);
      console.error(error);
    }
  }

  console.log("Done");
}

main();