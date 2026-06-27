import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  AI_FESTIVAL_WINNERS_SOURCE,
  extractAiFestivalWinners,
} from "../lib/ai-festival-winners.mjs";
import {
  upsertFilmFestivalRecognitions,
} from "../lib/film-festival-recognition.mjs";

applyAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports");

function parseArgs(args) {
  const limitIndex = args.indexOf("--limit");
  const offsetIndex = args.indexOf("--offset");
  const filmIdsIndex = args.indexOf("--film-ids");
  const concurrencyIndex = args.indexOf("--concurrency");

  return {
    dryRun: args.includes("--dry-run"),
    withoutRecognitions: args.includes("--without-recognitions"),
    limit:
      limitIndex === -1 ? 20 : Number.parseInt(args[limitIndex + 1], 10),
    offset:
      offsetIndex === -1 ? 0 : Number.parseInt(args[offsetIndex + 1], 10),
    concurrency:
      concurrencyIndex === -1
        ? 3
        : Number.parseInt(args[concurrencyIndex + 1], 10),
    filmIds:
      filmIdsIndex === -1
        ? null
        : String(args[filmIdsIndex + 1] ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
  };
}

async function loadFilms(supabase, args) {
  const fields = "id, title, original_title, year, director, country";

  if (args.filmIds?.length) {
    const { data, error } = await supabase
      .from("films")
      .select(fields)
      .in("id", args.filmIds)
      .order("title");

    if (error) throw error;
    return data ?? [];
  }

  const { data: films, error: filmsError } = await supabase
    .from("films")
    .select(fields)
    .order("title");

  if (filmsError) throw filmsError;

  let result = films ?? [];

  if (args.withoutRecognitions) {
    const { data: recognitions, error } = await supabase
      .from("film_festival_recognitions")
      .select("film_id");

    if (error) throw error;

    const recognisedFilmIds = new Set(
      (recognitions ?? []).map((row) => row.film_id)
    );

    result = result.filter((film) => !recognisedFilmIds.has(film.id));
  }

  return result.slice(args.offset, args.offset + args.limit);
}

async function runWithConcurrency(tasks, concurrency) {
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      await tasks[current]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY"
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const openai = new OpenAI({ apiKey: openaiApiKey });

  const films = await loadFilms(supabase, args);

  console.log(
    `AI festival winners discovery — ${films.length} film(s), concurrency ${args.concurrency}`
  );

  const report = {
    source: AI_FESTIVAL_WINNERS_SOURCE,
    processed: 0,
    filmsWithAwards: 0,
    awardsFound: 0,
    awardsSaved: 0,
    errors: 0,
  };

  const tasks = films.map((film) => async () => {
    report.processed += 1;

    try {
      const parsed = await extractAiFestivalWinners(openai, film);

      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const recognitions = parsed.value;

      if (!recognitions.length) {
        console.log(`[no awards] ${film.title}`);
        return;
      }

      report.filmsWithAwards += 1;
      report.awardsFound += recognitions.length;

      if (!args.dryRun) {
        const saved = await upsertFilmFestivalRecognitions(
          supabase,
          film.id,
          recognitions
        );
        report.awardsSaved += saved.length;
      } else {
        report.awardsSaved += recognitions.length;
      }

      console.log(
        `[awards] ${film.title}: ${recognitions
          .map(
            (item) =>
              `${item.festival_name} · ${item.award_name} (${item.award_result})`
          )
          .join("; ")}`
      );
    } catch (error) {
      report.errors += 1;
      console.error(
        `[winner-discovery-error] ${film.title}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });

  await runWithConcurrency(tasks, args.concurrency);

  mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    REPORTS_DIR,
    `ai-festival-winners-${timestamp}.json`
  );

  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        report,
      },
      null,
      2
    )}\n`
  );

  console.log("\n=== AI festival winners summary ===");
  console.log(`- processed: ${report.processed}`);
  console.log(`- films with awards: ${report.filmsWithAwards}`);
  console.log(`- awards found: ${report.awardsFound}`);
  console.log(`- awards saved: ${report.awardsSaved}`);
  console.log(`- errors: ${report.errors}`);
  console.log(`- report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});