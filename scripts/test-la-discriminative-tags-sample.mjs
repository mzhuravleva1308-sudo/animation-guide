/**
 * Dry-run sample test for discriminative VW/ST prompts.
 * Reads current tags from hosted, regenerates with NEW prompts, writes ONLY to tmp/.
 * Does NOT update films / embeddings / scores.
 *
 *   APP_ENV=hosted node scripts/test-la-discriminative-tags-sample.mjs
 */

import { applyAppEnv } from "./load-app-env.mjs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { MEDIA_TYPE } from "../lib/media-type.mjs";
import {
  buildVisualWorldTagsOnlyPrompt,
  normalizeVisualWorldTagsPreferVocabulary,
} from "../lib/film-discovery-visual-world-tags.mjs";
import {
  buildStorytellingTagsOnlyPrompt,
  normalizeStorytellingTagsPreferVocabulary,
} from "../lib/film-discovery-storytelling-tags.mjs";

applyAppEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OVERUSED_VW = ["intimate", "muted", "naturalistic"];
const OVERUSED_ST = ["character-driven", "slow-burn", "observational"];

const CONTRAST_PAIRS = [
  ["Breath", "Godland"],
  ["Perfect Days", "Les Choristes"],
  ["The Taste of Things", "The Handmaiden"],
];

const DISTINCTION_TITLES = [
  "Little Forest",
  "Portrait of a Lady on Fire",
  "The Banshees of Inisherin",
  "Tracks",
  "The Eight Mountains",
  "Sorry, Baby",
];

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
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function findByTitle(films, title) {
  const needle = title.toLowerCase();
  return (
    films.find((f) => f.title?.toLowerCase() === needle) ??
    films.find((f) => f.title?.toLowerCase().includes(needle)) ??
    null
  );
}

function freq(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    for (const tag of row[field] ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const n = Math.max(1, rows.length);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({
      tag,
      count,
      share: Number((count / n).toFixed(3)),
    }));
}

function overusedShare(freqRows, tags) {
  return Object.fromEntries(
    tags.map((tag) => [
      tag,
      freqRows.find((row) => row.tag === tag)?.share ?? 0,
    ])
  );
}

async function generateAxis(film, axis) {
  const isVw = axis === "visual_world";
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini",
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content: isVw
          ? "You create highly discriminative live-action Visual World tags. Prefer distinctive traits; omit generic festival-cinema defaults unless unusually defining."
          : "You create highly discriminative live-action Storytelling tags. Prefer distinctive narrative mechanics; omit generic festival-cinema defaults unless unusually defining.",
      },
      {
        role: "user",
        content: isVw
          ? buildVisualWorldTagsOnlyPrompt(film)
          : buildStorytellingTagsOnlyPrompt(film),
      },
    ],
  });
  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error(`Empty AI response for ${film.title}`);
  const parsed = parseJson(text);
  if (isVw) {
    const preferred = normalizeVisualWorldTagsPreferVocabulary(
      parsed.visual_world_tags
    );
    const suggested = [
      ...normalizeVisualWorldTagsPreferVocabulary(
        parsed.suggested_visual_world_tags
      ).offVocabulary,
      ...preferred.offVocabulary,
    ];
    return { tags: preferred.tags, suggested: [...new Set(suggested)] };
  }
  const preferred = normalizeStorytellingTagsPreferVocabulary(
    parsed.storytelling_tags
  );
  const suggested = [
    ...normalizeStorytellingTagsPreferVocabulary(
      parsed.suggested_storytelling_tags
    ).offVocabulary,
    ...preferred.offVocabulary,
  ];
  return { tags: preferred.tags, suggested: [...new Set(suggested)] };
}

async function main() {
  const reviewPath = path.join(process.cwd(), "tmp", "la-vw-st-review-maria.json");
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const profileId = review.profile.id;

  const { data: allFilms, error } = await supabase
    .from("films")
    .select(
      "id, title, original_title, director, year, country, synopsis, the_mood, moods, aesthetic_tags, visual_world_tags, storytelling_tags, media_type"
    )
    .eq("media_type", MEDIA_TYPE.liveAction)
    .order("title");
  if (error) throw error;

  const { data: ratings } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profileId)
    .gte("rating", 7);

  const likedIds = new Set((ratings ?? []).map((r) => r.film_id));
  const likedCoreTitles = (review.taste_cores ?? [])
    .filter((c) => c.core_type === "emotional" || c.core_type === "visual_world")
    .flatMap((c) => c.film_titles ?? []);
  const top20Titles = (review.top20 ?? []).map((r) => r.title);

  const titled = new Set([
    ...likedCoreTitles,
    ...top20Titles,
    ...CONTRAST_PAIRS.flat(),
    ...DISTINCTION_TITLES,
  ]);

  // Random sample of 20 from remaining catalog
  const remaining = allFilms.filter((f) => !titled.has(f.title));
  const shuffled = [...remaining].sort((a, b) => a.id.localeCompare(b.id));
  const random = shuffled.slice(0, 20).map((f) => f.title);

  const sampleTitles = [...new Set([...titled, ...random])];
  const sampleFilms = sampleTitles
    .map((title) => findByTitle(allFilms, title))
    .filter(Boolean);

  console.log(`Sample size: ${sampleFilms.length}`);
  console.log(
    `Buckets: liked/core≈${likedCoreTitles.length}, top20=${top20Titles.length}, contrast/distinction, random=${random.length}`
  );

  const results = await mapPool(sampleFilms, 6, async (film) => {
    console.log(`Retagging: ${film.title}`);
    const [vw, st] = await Promise.all([
      generateAxis(film, "visual_world"),
      generateAxis(film, "storytelling"),
    ]);
    return {
      id: film.id,
      title: film.title,
      liked: likedIds.has(film.id),
      in_top20: top20Titles.includes(film.title),
      old: {
        visual_world_tags: film.visual_world_tags ?? [],
        storytelling_tags: film.storytelling_tags ?? [],
      },
      proposed: {
        visual_world_tags: vw.tags,
        storytelling_tags: st.tags,
        suggested_visual_world_tags: vw.suggested,
        suggested_storytelling_tags: st.suggested,
      },
    };
  });

  const oldVwFreq = freq(
    results.map((r) => ({ visual_world_tags: r.old.visual_world_tags })),
    "visual_world_tags"
  );
  const newVwFreq = freq(
    results.map((r) => ({ visual_world_tags: r.proposed.visual_world_tags })),
    "visual_world_tags"
  );
  const oldStFreq = freq(
    results.map((r) => ({ storytelling_tags: r.old.storytelling_tags })),
    "storytelling_tags"
  );
  const newStFreq = freq(
    results.map((r) => ({ storytelling_tags: r.proposed.storytelling_tags })),
    "storytelling_tags"
  );

  const contrast = CONTRAST_PAIRS.map(([a, b]) => ({
    pair: [a, b],
    a: results.find((r) => r.title === a || r.title?.includes(a)),
    b: results.find((r) => r.title === b || r.title?.includes(b)),
  }));

  const distinctions = DISTINCTION_TITLES.map((title) =>
    results.find((r) => r.title === title || r.title?.includes(title))
  ).filter(Boolean);

  const report = {
    generated_at: new Date().toISOString(),
    sample_size: results.length,
    note: "Dry-run only. Hosted films table was NOT updated.",
    prompt_change_summary: {
      visual_world:
        "High-bar for intimate/muted/naturalistic; distinctive-only; festival-corpus awareness",
      storytelling:
        "High-bar for character-driven/slow-burn/observational; distinctive-only; prefer specific mechanics",
    },
    frequencies: {
      visual_world: {
        before: oldVwFreq,
        after: newVwFreq,
        overused_before: overusedShare(oldVwFreq, OVERUSED_VW),
        overused_after: overusedShare(newVwFreq, OVERUSED_VW),
      },
      storytelling: {
        before: oldStFreq,
        after: newStFreq,
        overused_before: overusedShare(oldStFreq, OVERUSED_ST),
        overused_after: overusedShare(newStFreq, OVERUSED_ST),
      },
    },
    contrast_pairs: contrast,
    distinction_films: distinctions,
    all_results: results,
  };

  const outPath = path.join(
    process.cwd(),
    "tmp",
    "la-discriminative-tags-sample.json"
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\nWrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        sample_size: report.sample_size,
        vw_overused: {
          before: report.frequencies.visual_world.overused_before,
          after: report.frequencies.visual_world.overused_after,
        },
        st_overused: {
          before: report.frequencies.storytelling.overused_before,
          after: report.frequencies.storytelling.overused_after,
        },
        vw_top_after: newVwFreq.slice(0, 10),
        st_top_after: newStFreq.slice(0, 10),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
