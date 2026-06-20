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

const MAX_TAGS = 7;

function normalizeTag(tag) {
  return tag.trim().toLowerCase();
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error(`Could not parse JSON: ${text}`);
    }

    return JSON.parse(match[0]);
  }
}

async function getFilms() {
  const { data, error } = await supabase
    .from("films")
    .select(
      "id, title, original_title, director, year, country, synopsis, moods, themes, technique, aesthetic_tags"
    )
    .order("title");

  if (error) throw error;

  return data ?? [];
}

async function generateAestheticTags(film) {
  const prompt = `
You are tagging animated feature films for an animation taste recommendation system.

We already have emotional mood tags. Now generate AESTHETIC / MATERIAL FEELING tags.

These tags should describe how the animated world feels visually, materially, texturally, and sensorially.

Important distinction:
- Do NOT repeat pure emotional moods like "sad", "tender", "melancholic", "hopeful".
- Do NOT use plain technical labels only, like "2D animation" or "stop-motion", unless transformed into a felt aesthetic quality.
- Prefer tags like:
  "handmade", "tactile", "puppet-like", "miniature world", "paper-cut feeling",
  "storybook-like", "ornamental", "fluid", "elemental", "organic",
  "polished handmade", "sketch-like", "clay-like", "flat decorative world",
  "soft grotesque", "domestic grotesque", "lush hand-drawn world",
  "cold vastness", "rough texture", "delicate macabre".

Film:
Title: ${film.title}
Original title: ${film.original_title ?? ""}
Director: ${film.director ?? ""}
Year: ${film.year ?? ""}
Country: ${film.country ?? ""}
Technique: ${film.technique ?? ""}
Moods: ${(film.moods ?? []).join(", ")}
Themes: ${(film.themes ?? []).join(", ")}
Synopsis: ${film.synopsis ?? ""}

Return 4-${MAX_TAGS} aesthetic/material feeling tags.

Rules:
- lowercase only
- 2-4 words per tag
- no duplicates
- no explanations
- return only JSON

Format:
{
  "aesthetic_tags": ["...", "..."]
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          "You create precise aesthetic/material feeling tags for animated films.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = response.choices[0]?.message?.content;

  if (!text) {
    throw new Error("Empty AI response");
  }

  const parsed = parseJson(text);

  const tags = Array.isArray(parsed.aesthetic_tags)
    ? parsed.aesthetic_tags
    : [];

  return Array.from(
    new Set(
      tags
        .map(String)
        .map(normalizeTag)
        .filter(Boolean)
        .slice(0, MAX_TAGS)
    )
  );
}

async function main() {
  const films = await getFilms();

  console.log(`Films found: ${films.length}`);

  for (const film of films) {
    if (film.aesthetic_tags?.length) {
      console.log(`Exists: ${film.title}`);
      continue;
    }

    console.log(`Generating aesthetic tags: ${film.title}`);

    const aestheticTags = await generateAestheticTags(film);

    console.log(`  ${aestheticTags.join(", ")}`);

    const { error } = await supabase
      .from("films")
      .update({
        aesthetic_tags: aestheticTags,
      })
      .eq("id", film.id);

    if (error) throw error;
  }

  console.log("\nDone");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});