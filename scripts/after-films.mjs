import { spawnSync } from "node:child_process";
import {
  describeFilmScope,
  filmScopeArgvTokens,
  parseFilmScopeArgs,
} from "./film-scope.mjs";

const scope = parseFilmScopeArgs(process.argv.slice(2));
const scopeTokens = filmScopeArgvTokens(scope);
const scriptArgs = [...scopeTokens, ...scope.passthrough];

function run(scriptPath) {
  console.log(`\n▶ node ${scriptPath}${scriptArgs.length ? ` ${scriptArgs.join(" ")}` : ""}\n`);

  const result = spawnSync("node", [scriptPath, ...scriptArgs], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  console.log(`Scope: ${describeFilmScope(scope)}`);

  run("scripts/fill-images.mjs");
  run("scripts/cache-posters.mjs");
  run("scripts/fill-trailers.mjs");
  run("scripts/fill-film-mood-embeddings.mjs");
  run("scripts/fill-mood-distances.mjs");

  console.log("\nDone: film enrichment completed.\n");
} catch (error) {
  console.error("\nAfter-films script failed.\n");
  console.error(error);
  process.exit(1);
}
