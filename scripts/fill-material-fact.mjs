import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { MEDIA_TYPE } from "../lib/media-type.mjs";
import {
  buildMaterialFactPrompt,
  formatMaterialFact,
  normalizeMaterialFact,
} from "../lib/film-material-fact.mjs";
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
      "id, title, original_title, director, year, country, synopsis, the_mood, material_fact, media_type",
    applyFilters: (query) =>
      query.eq("media_type", MEDIA_TYPE.liveAction).order("title"),
  });
}

/**
 * @param {object} film
 */
async function generateMaterialFact(film) {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          'You write live-action card facts as "<thing>. <place>" only — concrete nouns for THIS film. Never output the literal words Object or Place.',
      },
      { role: "user", content: buildMaterialFactPrompt(film) },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("Empty AI response");

  const parsed = parseJson(text);
  const fromParts =
    parsed.object && parsed.place
      ? formatMaterialFact(parsed.object, parsed.place)
      : null;
  const normalized =
    normalizeMaterialFact(parsed.material_fact) ||
    normalizeMaterialFact(fromParts);

  if (!normalized) {
    throw new Error(
      `Invalid material_fact for ${film.title}: ${JSON.stringify(parsed)}`
    );
  }

  return normalized;
}

async function generateMaterialFactWithRetry(film) {
  try {
    return await generateMaterialFact(film);
  } catch (firstError) {
    console.warn(
      `  retry ${film.title}: ${
        firstError instanceof Error ? firstError.message : String(firstError)
      }`
    );
    return generateMaterialFact(film);
  }
}

async function main() {
  const films = await getFilms();
  const targets = films.filter(
    (film) => force || !normalizeMaterialFact(film.material_fact)
  );

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(`Live-action films: ${films.length}`);
  console.log(`To generate: ${targets.length}`);
  console.log(
    `Mode: ${force ? "force" : "fill-missing"}${dryRun ? " dry-run" : ""} concurrency=${concurrency}`
  );

  let done = 0;
  let failed = 0;
  await mapPool(targets, concurrency, async (film) => {
    console.log(`Generating material fact: ${film.title}`);
    let materialFact;
    try {
      materialFact = await generateMaterialFactWithRetry(film);
    } catch (error) {
      failed += 1;
      console.error(
        `  FAIL ${film.title}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }
    console.log(`  ${film.title}: ${materialFact}`);

    if (!dryRun) {
      const { error } = await supabase
        .from("films")
        .update({ material_fact: materialFact })
        .eq("id", film.id);
      if (error) throw error;
    }

    done += 1;
    if (done % 25 === 0 || done === targets.length) {
      console.log(`Progress material_fact: ${done}/${targets.length} (failed ${failed})`);
    }
  });

  console.log(`\nDone. filled=${done} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
