import { execSync } from "node:child_process";

function run(command) {
  console.log(`\n▶ ${command}\n`);

  execSync(command, {
    stdio: "inherit",
  });
}

try {
  run("node scripts/fill-images.mjs");
  run("node scripts/cache-posters.mjs");
  run("node scripts/fill-trailers.mjs");
  run("node scripts/fill-mood-distances.mjs");

  console.log("\nDone: films cleanup completed.\n");
} catch (error) {
  console.error("\nAfter-films script failed.\n");
  process.exit(1);
}