import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAppEnv } from "./load-app-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FIXTURE_PATH = path.join(
  __dirname,
  "fixtures",
  "backfill-sample-films.json"
);
const CONTROL_FIXTURE_PATH = path.join(
  __dirname,
  "fixtures",
  "backfill-control-batch-films.json"
);

const SAMPLE_FILM_IDS = [
  "19541540-4b15-4e87-b92d-20347998aa4c",
  "188efe8c-a492-4168-b6cd-5296014d7ab7",
  "f8982e01-3146-4358-8b2b-e7965da2717d",
  "c0260988-3945-4fd8-b187-fa1247902e0c",
  "92345a01-d2d5-43d3-84e7-d76bff1f5046",
  "065e6d94-0d51-4aff-b0e3-799973e5cedc",
  "00c8d7ea-0156-4efd-9ee1-e36115bddc9c",
  "00087374-0195-479f-acc7-0099e0e0c5da",
  "044e5a9d-2b31-462f-9d73-99c5fdf859da",
  "01f8e2b8-56af-4b73-97a1-63229055b22e",
  "043f38e2-2e43-4d38-9f75-485f9152335a",
  "08546211-f8be-4f9e-9075-e367cb7189c5",
];

const CONTROL_FILM_IDS = [
  ...SAMPLE_FILM_IDS,
  "088462e2-ae4e-402f-a79f-da49e196c3a6",
  "0ae7abb9-72b5-49a9-9693-0fb351094c3f",
  "0b0adb33-1779-4ecc-9448-94695f6196a2",
  "0be04901-0401-4be6-acb5-a82125f7abc3",
  "0cc0a864-8be2-4494-88ee-9020835e5a9f",
  "0cfd8cd3-c6d8-46e8-b241-8aa86bb722a0",
  "0f205fed-ae9d-462a-bd6d-c86d53db3ebe",
  "13547e41-8124-4af4-ba54-11e9aa7596f7",
  "146426f0-2c3a-4226-b9ef-877ffb14811a",
  "18707e35-cc1d-46fd-9dba-774e5bf372ed",
  "18dbae63-ef63-4cbd-9147-910780a647bc",
  "19d6d065-3f24-452d-961f-df8f193284cf",
  "1b6d1e20-962c-47a0-9545-d854a33eb5de",
];

/**
 * @param {"sample" | "control"} target
 */
async function exportFixture(target) {
  applyAppEnv({ mode: "hosted" });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const ids = target === "control" ? CONTROL_FILM_IDS : SAMPLE_FILM_IDS;
  const outputPath =
    target === "control" ? CONTROL_FIXTURE_PATH : SAMPLE_FIXTURE_PATH;

  const { data, error } = await supabase
    .from("films")
    .select(
      "id,title,original_title,director,year,country,duration_minutes,synopsis,technique,moods,aesthetic_tags,narrative_tags,festival,section,source_url,cold_start_score"
    )
    .in("id", ids)
    .order("title");

  if (error) {
    throw error;
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(`${outputPath}`, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${data.length} films to ${outputPath}`);
}

async function seedLocal(target) {
  applyAppEnv({ mode: "development" });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const fixturePath =
    target === "control" ? CONTROL_FIXTURE_PATH : SAMPLE_FIXTURE_PATH;
  const films = JSON.parse(readFileSync(fixturePath, "utf8"));
  const { error: insertError } = await supabase
    .from("films")
    .upsert(films, { onConflict: "id" });

  if (insertError) {
    throw insertError;
  }

  console.log(`Seeded ${films.length} ${target} films into local Supabase`);
}

async function main() {
  if (process.argv.includes("--export-control")) {
    await exportFixture("control");
    return;
  }

  if (process.argv.includes("--export")) {
    await exportFixture("sample");
    return;
  }

  const target = process.argv.includes("--control") ? "control" : "sample";
  await seedLocal(target);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
