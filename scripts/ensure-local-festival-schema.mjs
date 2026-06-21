import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const SQL_FILES = [
  "supabase/bootstrap-festival-layer.sql",
  "supabase/migrations/20260628_add_festival_claim_tier_statuses.sql",
];

function findLocalDbContainer() {
  const dockerDb = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });

  if (dockerDb.status !== 0) {
    return null;
  }

  return (
    dockerDb.stdout
      ?.split("\n")
      .map((name) => name.trim())
      .find((name) => name.startsWith("supabase_db_")) ?? null
  );
}

function runSql(sql, label) {
  const direct = spawnSync(
    "psql",
    [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      input: sql,
    }
  );

  if (direct.status === 0) {
    return direct.stdout.trim();
  }

  const containerName = findLocalDbContainer();
  if (!containerName) {
    throw new Error(
      direct.stderr?.trim() ||
        direct.stdout?.trim() ||
        `${label}: psql is unavailable and no supabase_db container was found.`
    );
  }

  const viaDocker = spawnSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      input: sql,
    }
  );

  if (viaDocker.status !== 0) {
    throw new Error(
      viaDocker.stderr?.trim() ||
        viaDocker.stdout?.trim() ||
        `${label}: failed via docker exec into ${containerName}.`
    );
  }

  return viaDocker.stdout.trim();
}

async function main() {
  for (const relativePath of SQL_FILES) {
    const filePath = path.join(REPO_ROOT, relativePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing SQL file: ${relativePath}`);
    }

    console.log(`Applying ${relativePath}...`);
    runSql(fs.readFileSync(filePath, "utf8"), relativePath);
  }

  console.log("Reloading PostgREST schema cache...");
  runSql("NOTIFY pgrst, 'reload schema';", "schema reload");

  console.log("Local festival schema is ready.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
