import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  EDITORIAL_COPY_SYSTEM_PROMPT,
  buildMoodOnlyPrompt,
  buildWhatItIsOnlyPrompt,
  getWhatItIsIssues,
  validateMoodOnly,
} from "../lib/film-editorial-copy.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const MAX_WHAT_IT_IS_ATTEMPTS = 6;
const MAX_MOOD_ATTEMPTS = 8;

function isWeakVerbOnlyWhatItIsIssues(issues) {
  return (
    issues.length > 0 &&
    issues.every(
      (issue) =>
        issue.includes("weak catalog verb") ||
        issue.includes("abstract or psychological wording")
    )
  );
}

function isBestEffortMoodAcceptable(issues) {
  return !issues.some(
    (issue) =>
      issue.includes('"like"') ||
      issue.includes("simile") ||
      issue.includes("must be one compact sentence")
  );
}

function truncateToWordLimit(text, limit) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) {
    return text.trim();
  }
  return `${words.slice(0, limit).join(" ").replace(/[,;]+$/, "")}.`;
}

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

function parseArgs(argv) {
  const titles = [];
  let force = false;
  let all = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--all") {
      all = true;
      continue;
    }

    if (arg === "--title") {
      const next = argv[index + 1];

      if (!next) {
        throw new Error("Missing value for --title");
      }

      titles.push(next.trim());
      index += 1;
      continue;
    }

    if (arg.startsWith("--title=")) {
      const title = arg.slice("--title=".length).trim();

      if (title) {
        titles.push(title);
      }
    }
  }

  if (!all && !titles.length) {
    throw new Error(
      'Pass --all to process the full catalog, or one or more --title "Film Name" flags.'
    );
  }

  return {
    titles,
    force,
    all,
  };
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

const FILM_FIELDS =
  "id, title, original_title, director, year, country, duration_minutes, synopsis, technique, moods, aesthetic_tags, narrative_tags, themes, dialogue, emotional_intensity, weirdness, kid_safety, what_it_is, the_mood";

async function getAllFilms() {
  const pageSize = 100;
  const films = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("films")
      .select(FILM_FIELDS)
      .order("title")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    if (!data?.length) {
      break;
    }

    films.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return films;
}

async function getFilms(titles) {
  const films = [];

  for (const title of titles) {
    const { data, error } = await supabase
      .from("films")
      .select(FILM_FIELDS)
      .ilike("title", title)
      .limit(1);

    if (error) throw error;

    if (!data?.length) {
      console.warn(`Not found: ${title}`);
      continue;
    }

    films.push(data[0]);
  }

  return films;
}

async function requestWhatItIs(film, repairNote = "", temperature = 0.35) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature,
    messages: [
      {
        role: "system",
        content: EDITORIAL_COPY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildWhatItIsOnlyPrompt(film, repairNote),
      },
    ],
  });

  const text = response.choices[0]?.message?.content;

  if (!text) {
    throw new Error("Empty AI response");
  }

  const parsed = parseJson(text);
  const whatItIs = String(parsed.what_it_is ?? "").trim();
  const issues = getWhatItIsIssues(whatItIs);

  return {
    ok: issues.length === 0,
    issues,
    what_it_is: whatItIs,
  };
}

async function requestMoodOnly(film, whatItIs, repairNote = "", temperature = 0.3) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature,
    messages: [
      {
        role: "system",
        content: EDITORIAL_COPY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildMoodOnlyPrompt(film, whatItIs, repairNote),
      },
    ],
  });

  const text = response.choices[0]?.message?.content;

  if (!text) {
    throw new Error("Empty AI response");
  }

  const parsed = parseJson(text);

  return validateMoodOnly(parsed.the_mood, whatItIs);
}

async function generateWhatItIs(film) {
  let repairNote = "";
  let bestAttempt = null;

  for (let attempt = 1; attempt <= MAX_WHAT_IT_IS_ATTEMPTS; attempt += 1) {
    const temperature = attempt === 1 ? 0.3 : 0.45;
    const result = await requestWhatItIs(film, repairNote, temperature);

    if (result.ok) {
      return result.what_it_is;
    }

    if (!bestAttempt || result.issues.length < bestAttempt.issues.length) {
      bestAttempt = result;
    }

    if (attempt === MAX_WHAT_IT_IS_ATTEMPTS) {
      if (
        bestAttempt?.what_it_is &&
        isWeakVerbOnlyWhatItIsIssues(bestAttempt.issues)
      ) {
        console.warn(
          `  Using best-effort what_it_is for ${film.title}: ${bestAttempt.issues.join("; ")}`
        );
        return bestAttempt.what_it_is;
      }

      throw new Error(
        `Could not generate acceptable what_it_is for ${film.title}: ${bestAttempt?.issues.join("; ") ?? "unknown error"}`
      );
    }

    repairNote = [
      result.issues.join("\n"),
      attempt >= 3
        ? 'Never use navigates, explores, struggles with, grapples with, reflects on, confronts, recalls, or examines. Use plain verbs: tells, follows, hides, steals, escapes, joins, hunts, builds, loses, reunites, is thrown into, is killed in.'
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    console.warn(
      `  Retry what_it_is ${attempt} for ${film.title}: ${result.issues.join("; ")}`
    );
  }

  throw new Error(`Could not generate what_it_is for ${film.title}`);
}

async function generateMood(film, whatItIs) {
  let repairNote = "";
  let bestAttempt = null;

  for (let attempt = 1; attempt <= MAX_MOOD_ATTEMPTS; attempt += 1) {
    const temperature = attempt <= 2 ? 0.25 : attempt <= 4 ? 0.15 : 0.1;
    const result = await requestMoodOnly(film, whatItIs, repairNote, temperature);

    if (result.ok) {
      return result.the_mood;
    }

    if (
      !bestAttempt ||
      result.issues.length < bestAttempt.issues.length
    ) {
      bestAttempt = result;
    }

    if (attempt === MAX_MOOD_ATTEMPTS) {
      if (
        bestAttempt?.the_mood &&
        isBestEffortMoodAcceptable(bestAttempt.issues)
      ) {
        const mood = truncateToWordLimit(bestAttempt.the_mood, 22);
        console.warn(
          `  Using best-effort the_mood for ${film.title}: ${bestAttempt.issues.join("; ")}`
        );
        return mood;
      }

      throw new Error(
        `Could not generate acceptable the_mood for ${film.title}: ${bestAttempt?.issues.join("; ") ?? "unknown error"}`
      );
    }

    repairNote = [
      result.issues
        .filter((issue) => issue.startsWith("the_mood"))
        .join("\n"),
      attempt >= 3 ? "Never use charming, whimsical, delightful, storybook, reflective, or introspective wording." : "",
      attempt >= 5 && /documentary|interview|afghan|denmark/i.test(`${film.synopsis ?? ""} ${film.title}`)
        ? 'Use this mood if needed: "Quiet and fragile, with an emotional tension that grows through what is left unsaid."'
        : "",
      attempt >= 5 && /boxtroll|snatcher/i.test(`${film.synopsis ?? ""} ${film.title}`)
        ? 'Use this mood if needed: "Tactile, funny and slightly grotesque, with more nervous energy than its cozy look suggests."'
        : "",
      attempt >= 5 && /mind game|yuasa/i.test(`${film.synopsis ?? ""} ${film.title} ${film.director ?? ""}`)
        ? 'Use this mood if needed: "Hyperactive, vulgar, euphoric and disorienting; it keeps changing shape before you can settle into it."'
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    console.warn(
      `  Retry the_mood ${attempt} for ${film.title}: ${result.issues.join("; ")}`
    );
  }

  throw new Error(`Could not generate the_mood for ${film.title}`);
}

async function generateEditorialCopy(film) {
  const what_it_is = await generateWhatItIs(film);
  const the_mood = await generateMood(film, what_it_is);

  return { what_it_is, the_mood };
}

async function main() {
  const { titles, force, all } = parseArgs(process.argv.slice(2));

  const films = all ? await getAllFilms() : await getFilms(titles);

  if (!films.length) {
    throw new Error(all ? "No films found in catalog" : `No films matched: ${titles.join(", ")}`);
  }

  console.log(`Films in batch: ${films.length}`);

  let generated = 0;
  let skipped = 0;
  const failures = [];

  for (const film of films) {
    if (!force && film.what_it_is && film.the_mood) {
      console.log(`Exists: ${film.title}`);
      skipped += 1;
      continue;
    }

    console.log(`Generating editorial copy: ${film.title}`);

    try {
      const copy = await generateEditorialCopy(film);

      console.log(`  What it is: ${copy.what_it_is}`);
      console.log(`  The mood: ${copy.the_mood}`);

      const { error } = await supabase
        .from("films")
        .update({
          what_it_is: copy.what_it_is,
          the_mood: copy.the_mood,
        })
        .eq("id", film.id);

      if (error) throw error;

      generated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed: ${film.title} — ${message}`);
      failures.push({ title: film.title, message });
    }
  }

  console.log(`\nDone. Generated: ${generated}, skipped: ${skipped}, failed: ${failures.length}`);

  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`- ${failure.title}: ${failure.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
