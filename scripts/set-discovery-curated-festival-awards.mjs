#!/usr/bin/env node
/**
 * Clear AI festival_recognitions on manual_seed candidates, then load curated
 * award wins provided by curator. Staging only — does not touch films.
 *
 *   WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 APP_ENV=hosted \
 *     node scripts/set-discovery-curated-festival-awards.mjs --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_SOURCE = "manual_curator_awards_v1";

/**
 * @param {string} festivalName
 * @param {number} festivalYear
 * @param {string} awardName
 * @param {string} [awardResult]
 */
function award(festivalName, festivalYear, awardName, awardResult = "winner") {
  const key = [
    "curator",
    festivalName.toLowerCase(),
    String(festivalYear),
    awardName.toLowerCase(),
  ]
    .join("-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    festival_name: festivalName,
    festival_year: festivalYear,
    section: null,
    recognition_type: "award",
    award_name: awardName,
    award_result: awardResult,
    source_url: null,
    source_label: "Manual curator awards",
    source_type: "manual",
    original_text: null,
    import_source: IMPORT_SOURCE,
    import_key: key,
  };
}

/** @type {Record<string, object[]>} */
const CURATED_BY_TITLE = {
  Renaissance: [
    award(
      "Annecy International Animation Film Festival",
      2006,
      "Cristal for Best Feature"
    ),
  ],
  "Rio 2096: A Story of Love and Fury": [
    award(
      "Annecy International Animation Film Festival",
      2013,
      "Cristal for Best Feature"
    ),
  ],
  Funan: [
    award(
      "Annecy International Animation Film Festival",
      2018,
      "Cristal for a Feature Film"
    ),
  ],
  "Bob Spit: We Do Not Like People": [
    award(
      "Annecy International Animation Film Festival",
      2021,
      "Contrechamp Award, Best Film"
    ),
  ],
  "My Sunny Maad": [
    award(
      "Annecy International Animation Film Festival",
      2021,
      "Jury Award"
    ),
    award("César Awards", 2023, "Best Animated Film"),
  ],
  "Cheatin'": [
    award(
      "Annecy International Animation Film Festival",
      2014,
      "Special Jury Award, Feature Film"
    ),
  ],
  "Kill It and Leave This Town": [
    award(
      "Annecy International Animation Film Festival",
      2020,
      "Jury Distinction, Feature Film"
    ),
  ],
  "The Fake": [
    award("Sitges Film Festival", 2013, "Best Animated Feature Film"),
    award("Gijón International Film Festival", 2013, "Best Animation"),
  ],
  "The King of Pigs": [
    award("Busan International Film Festival", 2011, "NETPAC Award"),
    award(
      "Busan International Film Festival",
      2011,
      "DGK Directors Award"
    ),
    award(
      "Busan International Film Festival",
      2011,
      "CGV Movie Collage Award"
    ),
  ],
  "On Happiness Road": [
    award("Golden Horse Awards", 2018, "Best Animation Feature"),
    award("Tokyo Anime Award Festival", 2018, "Grand Prize"),
    award("Taipei Film Awards", 2018, "Grand Award"),
  ],
};

function normalizeTitle(title) {
  return String(title ?? "")
    .trim()
    .replace(/[’‘]/g, "'")
    .toLowerCase();
}

function parseArgs(argv) {
  const options = { write: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") options.write = true;
    else if (arg === "--dry-run") options.write = false;
    else if (arg === "--out") options.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  applyAppEnv({ mode: "hosted" });
  const options = parseArgs(process.argv.slice(2));

  if (options.write && process.env.WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM !== "1") {
    throw new Error(
      "Refusing write. Re-run with WEEKLY_FILM_DISCOVERY_CONTENT_CONFIRM=1 --write"
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env required");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("film_discovery_candidates")
    .select("id, title, festival_recognitions")
    .eq("source", "manual_seed")
    .order("title", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const curatedIndex = new Map(
    Object.entries(CURATED_BY_TITLE).map(([title, awards]) => [
      normalizeTitle(title),
      awards,
    ])
  );

  /** @type {object[]} */
  const results = [];
  let cleared = 0;
  let curated = 0;
  let missing = [...curatedIndex.keys()];

  for (const row of rows) {
    const key = normalizeTitle(row.title);
    const awards = curatedIndex.get(key) ?? [];
    if (awards.length) {
      missing = missing.filter((t) => t !== key);
      curated += 1;
    }

    const before = row.festival_recognitions ?? [];
    const after = awards;
    let wrote = false;

    if (options.write) {
      const { error: updateError } = await supabase
        .from("film_discovery_candidates")
        .update({
          festival_recognitions: after,
          content_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
      wrote = true;
      if (Array.isArray(before) && before.length && after.length === 0) {
        cleared += 1;
      } else if (
        Array.isArray(before) &&
        before.length &&
        after.length > 0 &&
        JSON.stringify(before) !== JSON.stringify(after)
      ) {
        cleared += 1;
      } else if ((!before || before.length === 0) && after.length === 0) {
        // already empty
      } else if (after.length === 0 && Array.isArray(before) && before.length) {
        cleared += 1;
      }
      if (after.length === 0 && Array.isArray(before) && before.length > 0) {
        // counted above
      }
    }

    if (
      options.write &&
      Array.isArray(before) &&
      before.length > 0 &&
      after.length === 0
    ) {
      // cleared-only path already handled
    }

    results.push({
      id: row.id,
      title: row.title,
      before_count: Array.isArray(before) ? before.length : 0,
      after_count: after.length,
      after,
      wrote,
    });
  }

  if (options.write) {
    cleared = results.filter((r) => r.before_count > 0 && r.after_count === 0)
      .length;
    const replaced = results.filter(
      (r) => r.before_count > 0 && r.after_count > 0
    ).length;
    cleared += replaced;
  }

  if (missing.length) {
    throw new Error(
      `Curated titles not found in manual_seed: ${missing.join(", ")}`
    );
  }

  const report = {
    dry_run: !options.write,
    write: options.write,
    source: "manual_seed",
    candidates: rows.length,
    curated_films: curated,
    films_with_awards_after: results.filter((r) => r.after_count > 0).length,
    cleared_or_replaced: cleared,
    database_mutated: options.write,
    writes_to_films_table: false,
    results: results.filter((r) => r.before_count > 0 || r.after_count > 0),
  };

  const outPath =
    options.out ||
    path.join(
      ROOT,
      "tmp",
      options.write
        ? "discovery-curated-festival-awards-hosted-write.json"
        : "discovery-curated-festival-awards-dry-run.json"
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        out: outPath,
        candidates: report.candidates,
        curated_films: report.curated_films,
        films_with_awards_after: report.films_with_awards_after,
        database_mutated: report.database_mutated,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
