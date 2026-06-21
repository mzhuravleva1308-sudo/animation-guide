import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyAppEnv } from "./load-app-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const MIGRATION_FILES = [
  "supabase/migrations/20260629_add_film_semantic_descriptions.sql",
  "supabase/migrations/20260630_add_film_editorial_copy.sql",
];

function parseArgs(argv) {
  let dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim() || null;
  let databaseUrl = process.env.DATABASE_URL?.trim() || null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--db-password") {
      dbPassword = argv[index + 1]?.trim() || null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--db-password=")) {
      dbPassword = arg.slice("--db-password=".length).trim() || null;
      continue;
    }

    if (arg === "--database-url") {
      databaseUrl = argv[index + 1]?.trim() || null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--database-url=")) {
      databaseUrl = arg.slice("--database-url=".length).trim() || null;
    }
  }

  return { dbPassword, databaseUrl };
}

function getProjectRef(supabaseUrl) {
  const match = supabaseUrl?.match(/^https:\/\/([^.]+)\.supabase\.co/i);
  if (!match) {
    throw new Error(`Could not parse Supabase project ref from ${supabaseUrl}`);
  }

  return match[1];
}

function readAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }

  const tokenPath = path.join(os.homedir(), ".supabase", "access-token");
  if (fs.existsSync(tokenPath)) {
    return fs.readFileSync(tokenPath, "utf8").trim();
  }

  return null;
}

function buildDatabaseUrl(projectRef, dbPassword) {
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function applyViaManagementApi(projectRef, accessToken, sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Management API query failed (${response.status}): ${body.slice(0, 500)}`
    );
  }
}

async function applyViaPostgres(databaseUrl, sql) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  applyAppEnv({ mode: "hosted" });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for hosted mode");
  }

  const projectRef = getProjectRef(supabaseUrl);
  const { dbPassword, databaseUrl } = parseArgs(process.argv.slice(2));
  const accessToken = readAccessToken();
  const resolvedDatabaseUrl =
    databaseUrl || (dbPassword ? buildDatabaseUrl(projectRef, dbPassword) : null);

  for (const relativePath of MIGRATION_FILES) {
    const filePath = path.join(REPO_ROOT, relativePath);
    const sql = fs.readFileSync(filePath, "utf8");

    console.log(`Applying ${relativePath}...`);

    if (accessToken) {
      await applyViaManagementApi(projectRef, accessToken, sql);
    } else if (resolvedDatabaseUrl) {
      await applyViaPostgres(resolvedDatabaseUrl, sql);
    } else {
      throw new Error(
        "Hosted migration requires SUPABASE_ACCESS_TOKEN, DATABASE_URL, or SUPABASE_DB_PASSWORD."
      );
    }
  }

  console.log("Hosted migrations applied.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
