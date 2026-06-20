import { applyAppEnv } from "./load-app-env.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  analyzeFilmCatalog,
  formatMarkdownReport,
} from "../lib/catalog-analytics.mjs";
import { loadFilmsForCatalogAnalytics } from "../lib/load-films-catalog.mjs";

applyAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, "..", "reports");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const films = await loadFilmsForCatalogAnalytics(supabase);
  const analytics = analyzeFilmCatalog(films);
  const markdown = formatMarkdownReport(analytics);

  await mkdir(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, "film-catalog-analysis.json");
  const markdownPath = path.join(reportsDir, "film-catalog-analysis.md");

  await writeFile(jsonPath, `${JSON.stringify(analytics, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown, "utf8");

  console.log(`Analyzed ${films.length} films`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
