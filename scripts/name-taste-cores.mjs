import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

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

async function getTasteCores() {
  const { data, error } = await supabase
    .from("profile_taste_cores")
    .select(`
      id,
      core_index,
      strength,
      film_titles,
      nearest_moods,
      profiles (
        name,
        slug
      )
    `)
    .order("core_index");

  if (error) throw error;

  return data ?? [];
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

async function generateCoreName(core) {
  const profileName = core.profiles?.name ?? "this person";

  const prompt = `
You are naming a living taste cluster in an animation recommendation app.

The cluster belongs to: ${profileName}

Highly rated films in this cluster:
${core.film_titles.map((title) => `- ${title}`).join("\n")}

Nearest mood words:
${core.nearest_moods.join(", ")}

Create:
1. A short poetic but clear cluster name, 2-5 words.
2. A concise description, 1 sentence.

Important:
- Do not use vague poetic words like "whispers", "wonder", "serenity", "dreams", "journey", "realm", "sanctuary".
- Do not use generic fantasy names.
- Do not sound like marketing, self-help, or a meditation app.
- Prefer concrete names built from the actual moods and films.
- The name should be specific enough to distinguish this cluster from another cluster.
- Use 2-4 words.
- Good examples:
  "Soft Family Melancholy"
  "Wordless Animal Survival"
  "Deadpan Adult Loneliness"
  "Bright Magical Adventure"
  "Political Memory and Exile"
  "Strange Handmade Worlds"
- Bad examples:
  "Whispers of Wonder"
  "Echoes of Serenity"
  "Dreams of Solitude"
  "A Tender Journey"
- Return only JSON.

Format:
{
  "name": "...",
  "description": "..."
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You create short, evocative names for clusters of animated films.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
  });

  const text = response.choices[0]?.message?.content;

  if (!text) {
    throw new Error("Empty AI response");
  }

  const parsed = parseJson(text);

  return {
    name: String(parsed.name ?? "").trim(),
    description: String(parsed.description ?? "").trim(),
  };
}

async function main() {
  const cores = await getTasteCores();

  console.log(`Found ${cores.length} taste cores`);

  for (const core of cores) {
    const profileName = core.profiles?.name ?? "Unknown";

    console.log(`\nNaming ${profileName} / Core ${core.core_index}`);
    console.log(`Films: ${core.film_titles.join(", ")}`);
    console.log(`Moods: ${core.nearest_moods.join(", ")}`);

    const generated = await generateCoreName(core);

    console.log(`Name: ${generated.name}`);
    console.log(`Description: ${generated.description}`);

    const { error } = await supabase
      .from("profile_taste_cores")
      .update({
        name: generated.name,
        description: generated.description,
        name_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", core.id);

    if (error) throw error;
  }

  console.log("\nDone");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});