import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  buildBeforeAfterReport,
  buildFestivalRecognitionNormalizationPlan,
} from "../lib/festival-recognition-normalization.mjs";
import { FILM_FESTIVAL_RECOGNITION_FIELDS } from "../lib/load-film-festival-recognitions.mjs";

applyAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports");

/**
 * @param {string[]} args
 */
function parseArgs(args) {
  return {
    dryRun: args.includes("--dry-run"),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function loadAllRows(supabase) {
  const { data, error } = await supabase
    .from("film_festival_recognitions")
    .select(FILM_FESTIVAL_RECOGNITION_FIELDS)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>} row
 */
async function updateRow(supabase, row) {
  const { id, ...payload } = row;
  const { error } = await supabase
    .from("film_festival_recognitions")
    .update(payload)
    .eq("id", id);

  if (error) {
    throw error;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} id
 */
async function deleteRow(supabase, id) {
  const { error } = await supabase
    .from("film_festival_recognitions")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const beforeRows = await loadAllRows(supabase);
  const plan = buildFestivalRecognitionNormalizationPlan(beforeRows);
  const report = buildBeforeAfterReport(beforeRows, plan.finalRows, plan.actions);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(
    REPORTS_DIR,
    `festival-recognition-normalization-${timestamp}.json`
  );

  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        ...report,
        actions: plan.actions,
      },
      null,
      2
    )}\n`
  );

  console.log(`Loaded ${beforeRows.length} rows`);
  console.log(`Plan: ${plan.deleteIds.length} delete(s), ${plan.finalRows.length} final row(s)`);
  console.log(`Report: ${reportPath}`);

  if (dryRun) {
    console.log("Dry run only — no database changes applied.");
    return;
  }

  for (const id of plan.deleteIds) {
    await deleteRow(supabase, id);
    console.log(`[delete] ${id}`);
  }

  for (const row of plan.finalRows) {
    await updateRow(supabase, row);
    console.log(`[update] ${row.id} → ${row.canonical_festival_name} (${row.confidence_status})`);
  }

  console.log("Normalization complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
