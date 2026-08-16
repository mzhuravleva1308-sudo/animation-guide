/**
 * Full live-action Visual World + Storytelling backfill + score rebuild.
 *
 *   APP_ENV=hosted node scripts/backfill-live-action-vw-st.mjs --profile=maria
 *   APP_ENV=hosted node scripts/backfill-live-action-vw-st.mjs --profile=maria --force
 *   APP_ENV=hosted node scripts/backfill-live-action-vw-st.mjs --profile=maria --skip-tags
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAppEnv } from "./load-app-env.mjs";

applyAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const profileArg = argv.find((arg) => arg.startsWith("--profile="));
  return {
    profileSlug: profileArg?.slice("--profile=".length) ?? null,
    force: argv.includes("--force"),
    skipTags: argv.includes("--skip-tags"),
    skipEmbeddings: argv.includes("--skip-embeddings"),
    skipRebuild: argv.includes("--skip-rebuild"),
    skipReview: argv.includes("--skip-review"),
  };
}

function runNode(script, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(ROOT, "scripts", script), ...extraArgs],
      {
        cwd: ROOT,
        env: process.env,
        stdio: "inherit",
      }
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.profileSlug) {
    throw new Error("Pass --profile=<slug>");
  }

  const forceArgs = options.force ? ["--force"] : [];

  if (!options.skipTags) {
    console.log("\n=== AI Visual World tags ===");
    await runNode("fill-visual-world-tags.mjs", [
      "--all",
      "--concurrency=8",
      ...forceArgs,
    ]);
    console.log("\n=== AI Storytelling tags ===");
    await runNode("fill-storytelling-tags.mjs", [
      "--all",
      "--concurrency=8",
      ...forceArgs,
    ]);
  }

  if (!options.skipEmbeddings) {
    console.log("\n=== Visual World embeddings ===");
    await runNode("fill-film-visual-world-embeddings.mjs", ["--all"]);
    console.log("\n=== Storytelling embeddings ===");
    await runNode("fill-film-storytelling-embeddings.mjs", ["--all"]);
  }

  if (!options.skipRebuild) {
    console.log("\n=== Rebuild taste cores + scores ===");
    await runNode("rebuild-profile-film-scores.mjs", [
      `--profile=${options.profileSlug}`,
    ]);
  }

  if (!options.skipReview) {
    console.log("\n=== Review report ===");
    await runNode("review-live-action-vw-st-ranking.mjs", [
      `--profile=${options.profileSlug}`,
    ]);
  }

  console.log("\nBackfill complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
