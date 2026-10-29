#!/usr/bin/env node
/**
 * Fill films.plot_charge (jsonb: headline + charge_lines).
 * Does not touch storytelling_tags or ranking embeddings.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/fill-plot-charge.mjs --all
 *   APP_ENV=hosted node scripts/fill-plot-charge.mjs --all --dry-run
 *   APP_ENV=hosted node scripts/fill-plot-charge.mjs --pilot
 *   APP_ENV=hosted node scripts/fill-plot-charge.mjs --pilot --force
 *   APP_ENV=hosted node scripts/fill-plot-charge.mjs --titles=Flow,Coraline
 *   APP_ENV=hosted node scripts/fill-plot-charge.mjs --write-from-json=tmp/plot-charge-fill/all.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { MEDIA_TYPE } from "../lib/media-type.mjs";
import {
  PLOT_CHARGE_PILOT_TITLES,
  buildAnimationPlotChargePrompt,
  normalizePlotCharge,
} from "../lib/animation-plot-charge.mjs";

await applyAppEnv({ prefer: "hosted" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "plot-charge-fill");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TAG_MODEL = process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const force = argv.includes("--force");
const pilot = argv.includes("--pilot");
const fillAll = argv.includes("--all");
const titlesArg = argv.find((a) => a.startsWith("--titles="));
const writeFromJsonArg = argv.find((a) => a.startsWith("--write-from-json="));
const concurrencyArg = argv.find((a) => a.startsWith("--concurrency="));
const concurrency = Math.max(
  1,
  Number(concurrencyArg?.slice("--concurrency=".length) ?? 6) || 6
);

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Could not parse JSON: ${text.slice(0, 240)}`);
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
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return results;
}

async function assertColumn() {
  const probe = await supabase.from("films").select("plot_charge").limit(1);
  if (probe.error?.code === "42703") {
    throw new Error(
      "films.plot_charge column missing. Apply supabase/migrations/20261020_films_plot_charge.sql on hosted first."
    );
  }
  if (probe.error) throw probe.error;
}

async function generatePlotCharge(film) {
  const response = await openai.chat.completions.create({
    model: TAG_MODEL,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          "You write Plot Charge cards for animated films. Every headline and charge line must be a full English sentence ending with a period. Never use arrow chains (→). Return JSON only.",
      },
      { role: "user", content: buildAnimationPlotChargePrompt(film) },
    ],
  });
  const parsed = parseJson(response.choices[0]?.message?.content ?? "");
  const normalized = normalizePlotCharge(parsed);
  if (!normalized) {
    throw new Error(`Invalid plot_charge for ${film.title}`);
  }
  return normalized;
}

async function writeFromJson(filePath) {
  await assertColumn();
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const films = payload.films || [];
  let written = 0;
  for (const row of films) {
    const charge = normalizePlotCharge(row.plot_charge);
    if (!charge || !row.id) continue;
    if (dryRun) {
      written += 1;
      continue;
    }
    const { error } = await supabase
      .from("films")
      .update({ plot_charge: charge })
      .eq("id", row.id);
    if (error) throw error;
    written += 1;
    if (written % 25 === 0) process.stderr.write(`\nwrote ${written}/${films.length}`);
  }
  process.stderr.write("\n");
  console.log(`Wrote plot_charge for ${written} films from ${filePath}`);
}

async function loadFilms() {
  const selectCols =
    "id, title, year, director, synopsis, what_it_is, the_mood, storytelling_tags, plot_charge, media_type, catalog_visible";

  if (fillAll) {
    const { data, error } = await supabase
      .from("films")
      .select(selectCols)
      .eq("media_type", MEDIA_TYPE.animation)
      .eq("catalog_visible", true)
      .order("title");
    if (error) throw error;
    return data ?? [];
  }

  let titles;
  if (titlesArg) {
    titles = titlesArg
      .slice("--titles=".length)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } else if (pilot) {
    titles = [...PLOT_CHARGE_PILOT_TITLES];
  } else {
    throw new Error("Pass --all, --pilot, --titles=..., or --write-from-json=...");
  }

  const { data, error } = await supabase
    .from("films")
    .select(selectCols)
    .eq("media_type", MEDIA_TYPE.animation)
    .eq("catalog_visible", true)
    .in("title", titles);
  if (error) throw error;

  const byTitle = new Map((data ?? []).map((f) => [f.title, f]));
  const missing = titles.filter((t) => !byTitle.has(t));
  if (missing.length) {
    console.warn("Missing from hosted catalog:", missing.join(", "));
  }
  return titles.map((t) => byTitle.get(t)).filter(Boolean);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (writeFromJsonArg) {
    await writeFromJson(writeFromJsonArg.slice("--write-from-json=".length));
    return;
  }

  if (!dryRun) await assertColumn();
  else {
    try {
      await assertColumn();
    } catch (err) {
      console.warn(String(err.message || err));
    }
  }

  const films = await loadFilms();
  const targets = films.filter(
    (f) => force || !normalizePlotCharge(f.plot_charge)
  );

  console.log(`Loaded: ${films.length}; to fill: ${targets.length}`);
  console.log(
    `mode=${fillAll ? "all" : pilot ? "pilot" : "titles"} dryRun=${dryRun} force=${force} concurrency=${concurrency} model=${TAG_MODEL}`
  );

  const checkpointPath = path.join(
    OUT_DIR,
    fillAll ? "all-checkpoint.json" : "batch-checkpoint.json"
  );
  /** @type {Map<string, any>} */
  const done = new Map();
  if (fs.existsSync(checkpointPath)) {
    const prev = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    for (const row of prev.films || []) {
      if (row?.id && normalizePlotCharge(row.plot_charge)) {
        done.set(row.id, row);
      }
    }
    console.log(`Resuming checkpoint with ${done.size} rows`);
  }

  const pending = targets.filter((f) => force || !done.has(f.id));
  console.log(`Pending generate: ${pending.length}`);

  let completed = 0;
  await mapPool(pending, concurrency, async (film) => {
    try {
      const charge = await generatePlotCharge(film);
      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("films")
          .update({ plot_charge: charge })
          .eq("id", film.id);
        if (updateError) throw updateError;
      }
      done.set(film.id, {
        id: film.id,
        title: film.title,
        year: film.year,
        plot_charge: charge,
      });
    } catch (err) {
      done.set(film.id, {
        id: film.id,
        title: film.title,
        year: film.year,
        error: String(err?.message || err),
      });
    }
    completed += 1;
    if (completed % 20 === 0 || completed === pending.length) {
      fs.writeFileSync(
        checkpointPath,
        JSON.stringify(
          {
            generated_at: new Date().toISOString(),
            model: TAG_MODEL,
            dry_run: dryRun,
            films: [...done.values()],
          },
          null,
          2
        )
      );
      process.stderr.write(`\ncheckpoint ${completed}/${pending.length}`);
    } else {
      process.stderr.write(".");
    }
  });
  process.stderr.write("\n");

  const results = [...done.values()].filter((r) => r.plot_charge);
  const errors = [...done.values()].filter((r) => r.error);
  const outPath = path.join(
    OUT_DIR,
    dryRun
      ? fillAll
        ? "all-dry-run.json"
        : "pilot-dry-run.json"
      : fillAll
        ? "all.json"
        : "batch.json"
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        model: TAG_MODEL,
        dry_run: dryRun,
        force,
        filled: results.length,
        errors: errors.length,
        films: results,
        error_rows: errors,
      },
      null,
      2
    )
  );

  console.log(`\nFilled: ${results.length}; errors: ${errors.length}`);
  if (errors.length) {
    for (const row of errors.slice(0, 10)) {
      console.log(`  ! ${row.title}: ${row.error}`);
    }
  }
  console.log("\n## Sample\n");
  for (const row of results.slice(0, 3)) {
    console.log(`### ${row.title}`);
    console.log(row.plot_charge.headline);
    for (const line of row.plot_charge.charge_lines) console.log(`- ${line}`);
    console.log("");
  }
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
