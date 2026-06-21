import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function run(label, command, args, extraEnv = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout?.trim()) {
    console.log(result.stdout.trim());
  }

  if (result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed`);
  }
}

async function main() {
  run("Apply hosted migrations", "npm", ["run", "hosted:migrate"], {
    APP_ENV: "hosted",
  });
  run("Sync editorial copy from local", "npm", ["run", "hosted:sync-editorial"], {
    APP_ENV: "hosted",
  });
  run("Verify hosted fields", "npm", ["run", "hosted:verify"], {
    APP_ENV: "hosted",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
