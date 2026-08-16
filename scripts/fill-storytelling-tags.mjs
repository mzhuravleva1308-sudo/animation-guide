import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { MEDIA_TYPE } from "../lib/media-type.mjs";
import {
  STORYTELLING_TAGS_MIN,
  buildStorytellingTagsOnlyPrompt,
  normalizeStorytellingTagsPreferVocabulary,
} from "../lib/film-discovery-storytelling-tags.mjs";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";
import fs from "node:fs";
import path from "node:path";

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
const force = scope.passthrough.includes("--force");
const concurrencyArg = scope.passthrough.find((arg) =>
  arg.startsWith("--concurrency=")
);
const concurrency = Math.max(
  1,
  Number(concurrencyArg?.slice("--concurrency=".length) ?? 8) || 8
);

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Could not parse JSON: ${text}`);
    return JSON.parse(match[0]);
  }
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return results;
}

async function getFilms() {
  return loadScopedFilms(supabase, scope, {
    select:
      "id, title, original_title, director, year, country, synopsis, the_mood, moods, visual_world_tags, storytelling_tags, media_type",
    applyFilters: (query) =>
      query.eq("media_type", MEDIA_TYPE.liveAction).order("title"),
  });
}

async function generateStorytellingTags(film) {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You create precise live-action Storytelling tags. Never confuse mood, genre, or visual style with narrative mechanics.",
      },
      { role: "user", content: buildStorytellingTagsOnlyPrompt(film) },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("Empty AI response");

  const parsed = parseJson(text);
  const preferred = normalizeStorytellingTagsPreferVocabulary(
    parsed.storytelling_tags
  );
  const suggested = normalizeStorytellingTagsPreferVocabulary(
    parsed.suggested_storytelling_tags
  ).offVocabulary.concat(preferred.offVocabulary);

  return {
    tags: preferred.tags,
    suggested: [...new Set(suggested)],
  };
}

async function main() {
  const films = await getFilms();
  const suggestions = [];
  const targets = films.filter(
    (film) => force || !(film.storytelling_tags ?? []).length
  );

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(`Live-action films: ${films.length}`);
  console.log(`To generate: ${targets.length}`);
  console.log(
    `Mode: ${force ? "force" : "fill-missing"}${dryRun ? " dry-run" : ""} concurrency=${concurrency}`
  );

  let done = 0;
  await mapPool(targets, concurrency, async (film) => {
    console.log(`Generating storytelling tags: ${film.title}`);
    const { tags, suggested } = await generateStorytellingTags(film);

    if (tags.length < STORYTELLING_TAGS_MIN) {
      console.warn(
        `  WARN under-tagged (${tags.length}): ${film.title} — ${tags.join(", ") || "(none)"}`
      );
    } else {
      console.log(`  ${film.title}: ${tags.join(", ")}`);
    }
    if (suggested.length) {
      console.log(`  suggested(off-vocab): ${suggested.join(", ")}`);
      suggestions.push({
        film_id: film.id,
        title: film.title,
        suggested,
      });
    }

    if (!dryRun) {
      const { error } = await supabase
        .from("films")
        .update({ storytelling_tags: tags })
        .eq("id", film.id);
      if (error) throw error;
    }

    done += 1;
    if (done % 25 === 0 || done === targets.length) {
      console.log(`Progress ST: ${done}/${targets.length}`);
    }
  });

  if (suggestions.length) {
    const outPath = path.join(
      process.cwd(),
      "tmp",
      "storytelling-tag-suggestions.json"
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(suggestions, null, 2));
    console.log(`\nWrote off-vocab suggestions: ${outPath}`);
  }

  console.log("\nDone");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
