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
      "id, title, original_title, director, year, country, synopsis, technique, moods, themes, aesthetic_tags, narrative_tags"
    )
    .order("title")
    .limit(BATCH_LIMIT);

  if (error) throw error;

  return data ?? [];
}

async function generateNarrativeTags(film) {
  const prompt = `
You are tagging animated films for a personal recommendation system.

Generate 4 to 7 narrative experience tags for this animated film.

These tags should describe how the story works for the viewer:
- what kind of narrative journey it creates
- how it holds attention
- how the plot, structure, character arc, or viewer experience feels

Good narrative experience tags:
- quest-driven
- plot-driven
- character-driven
- conversation-led
- relationship-driven
- world discovery
- strange world discovery
- magical world discovery
- mystery-driven
- survival journey
- transformation arc
- coming-of-age arc
- road journey
- escape journey
- rescue mission
- caper structure
- heist-like adventure
- ensemble story
- quiet character study
- psychological portrait
- existential portrait
- moral dilemma
- emotionally layered
- symbolic journey
- philosophical fable
- satirical fable
- absurdist comedy
- surreal odyssey
- mythic tale
- folk-tale structure
- fairy-tale structure
- wordless journey
- observational story
- meditative journey
- episodic structure
- vignette structure
- slow-burn
- fast-paced
- adventure momentum
- atmospheric drift
- minimal plot
- simple story

Use these tags to describe how the story holds the viewer's attention:
- quest-driven / plot-driven: interest comes from goals, events, movement, and "what happens next"
- character-driven / psychological portrait: interest comes from inner conflict, choices, and character change
- conversation-led: interest comes mainly from dialogue, verbal nuance, and interpersonal scenes
- world discovery: interest comes from exploring a new world, rules, places, creatures, or hidden logic
- meditative / observational / atmospheric drift: interest comes from mood, observation, rhythm, and presence rather than strong plot
- minimal plot / simple story: use when the story may feel narratively thin even if the film is visually or emotionally strong

Avoid:
- pure themes: family, friendship, ecology, grief, childhood, war, memory, society, politics, love, death
- pure emotions: tender, melancholic, lonely, hopeful, anxious, eerie, warm, sad, playful
- visual/material style: handmade, tactile, painterly, textured, stylized, visual, cutout, puppet, colorful, 2d animation, stop-motion
- vague genre-only tags unless they describe the viewer experience: drama, comedy, fantasy, sci-fi, adventure

Important:
- Generate 4 to 7 narrative experience tags.
- Use lower-case English tags only.
- Return only JSON: {"narrative_tags":["tag one","tag two"]}
- Tags should describe the narrative experience, not just topic, emotion, genre, or visual style.

Film:
Title: ${film.title}
Original title: ${film.original_title ?? ""}
Director: ${film.director ?? ""}
Year: ${film.year ?? ""}
Country: ${film.country ?? ""}
Synopsis: ${film.synopsis ?? ""}
Technique: ${film.technique ?? ""}
Emotional moods: ${(film.moods ?? []).join(", ")}
Themes, do not copy directly unless transformed into narrative experience: ${(film.themes ?? []).join(", ")}
Aesthetic tags, do not copy: ${(film.aesthetic_tags ?? []).join(", ")}
`.trim();

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You create clean narrative experience tags for animated film recommendations. You return strict JSON only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.25,
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error(`No response for ${film.title}`);
  }

  const parsed = JSON.parse(content);

  const narrativeTags = Array.from(
    new Set(
      (parsed.narrative_tags ?? [])
        .map(normalizeTag)
        .filter(Boolean)
    )
  ).slice(0, 7);

  return narrativeTags;
}

async function updateFilm(film, narrativeTags) {
  const { error } = await supabase
    .from("films")
    .update({ narrative_tags: narrativeTags })
    .eq("id", film.id);

  if (error) throw error;
}

async function main() {
  const films = await getFilms();

  console.log(`Found ${films.length} films`);

  for (const film of films) {
    try {
      const narrativeTags = await generateNarrativeTags(film);

      console.log(`${film.title}: ${narrativeTags.join(", ")}`);

      await updateFilm(film, narrativeTags);
    } catch (error) {
      console.error(`Failed: ${film.title}`);
      console.error(error);
    }
  }

  console.log("Done");
}

main();