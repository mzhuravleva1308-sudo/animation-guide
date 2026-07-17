import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("profiles schema contract", () => {
  it("keeps profile name nullable for provisioning", async () => {
    const baseSchema = await readFile(
      `${repoRoot}/supabase/migrations/20250601_create_core_schema.sql`,
      "utf8"
    );
    const nullableMigration = await readFile(
      `${repoRoot}/supabase/migrations/20260717_make_profiles_name_nullable.sql`,
      "utf8"
    );

    assert.match(baseSchema, /name\s+text\s*,/i);
    assert.doesNotMatch(baseSchema, /name\s+text\s+not null/i);
    assert.match(
      nullableMigration,
      /alter column\s+name\s+drop not null/i
    );
    assert.match(
      nullableMigration,
      /alter column\s+share_token\s+set default\s+gen_random_uuid\(\)/i
    );
  });
});
