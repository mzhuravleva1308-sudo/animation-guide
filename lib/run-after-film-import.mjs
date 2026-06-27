import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Run post-import enrichment for a single film only.
 *
 * @param {string} filmId
 * @param {{ skip?: boolean }} [options]
 */
export function runAfterFilmImport(filmId, options = {}) {
  if (options.skip) {
    console.log("Skipping post-import enrichment (--skip-enrichment).");
    return;
  }

  if (!filmId) {
    throw new Error("runAfterFilmImport requires a film id");
  }

  console.log(`\n▶ Post-import enrichment for film ${filmId}\n`);

  const result = spawnSync(
    "node",
    ["scripts/after-films.mjs", "--film-id", filmId],
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
