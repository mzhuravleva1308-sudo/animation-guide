import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAdminAccessStatus } from "./admin-access-status.mjs";
import { denyAdminApiAccess } from "./admin-api-denial.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("P0-3 admin API denial mapping", () => {
  it("unauthenticated → 401", () => {
    assert.deepEqual(denyAdminApiAccess("unauthenticated"), {
      status: 401,
      error: "Authentication required",
    });
  });

  it("authenticated non-admin → 404", () => {
    assert.deepEqual(denyAdminApiAccess("authenticated_non_admin"), {
      status: 404,
      error: "Not found",
    });
  });

  it("admin → no denial", () => {
    assert.equal(denyAdminApiAccess("admin"), null);
  });

  it("maps resolveAdminAccessStatus through denial for anon and non-admin", () => {
    const anon = resolveAdminAccessStatus(null, "admin-id");
    assert.equal(denyAdminApiAccess(anon)?.status, 401);

    const nonAdmin = resolveAdminAccessStatus("other-id", "admin-id");
    assert.equal(denyAdminApiAccess(nonAdmin)?.status, 404);

    const admin = resolveAdminAccessStatus("admin-id", "admin-id");
    assert.equal(denyAdminApiAccess(admin), null);
  });
});

describe("P0-3 import-film and check-duplicate gate order", () => {
  it("import-film calls requireAdminApiAccess before OpenAI", () => {
    const source = fs.readFileSync(
      path.join(root, "app/api/import-film/route.ts"),
      "utf8"
    );
    const adminIdx = source.indexOf("requireAdminApiAccess");
    const openaiIdx = source.indexOf('import("openai")');
    assert.ok(adminIdx >= 0, "expected requireAdminApiAccess");
    assert.ok(openaiIdx >= 0, "expected dynamic openai import");
    assert.ok(
      adminIdx < openaiIdx,
      "admin check must run before OpenAI client creation"
    );
  });

  it("check-duplicate calls requireAdminApiAccess before service-role client", () => {
    const source = fs.readFileSync(
      path.join(root, "app/api/films/check-duplicate/route.ts"),
      "utf8"
    );
    const adminIdx = source.indexOf("requireAdminApiAccess");
    const serviceIdx = source.indexOf("getAdminSupabase()");
    // First getAdminSupabase is the function definition; call is later.
    const callIdx = source.indexOf("const adminSupabase = getAdminSupabase()");
    assert.ok(adminIdx >= 0, "expected requireAdminApiAccess");
    assert.ok(callIdx >= 0, "expected getAdminSupabase call");
    assert.ok(
      adminIdx < callIdx,
      "admin check must run before service-role client"
    );
    assert.ok(serviceIdx >= 0);
  });

  it("festival page gates before service-role query and admin pages are protected uniformly", () => {
    const festival = fs.readFileSync(
      path.join(root, "app/admin/festival-recognitions/page.tsx"),
      "utf8"
    );
    assert.match(festival, /getAdminAccessStatus/);
    assert.match(festival, /redirect\("\/login"\)/);
    assert.match(festival, /notFound\(\)/);
    assert.match(festival, /getFestivalAdminSupabase/);
    assert.ok(
      festival.indexOf("getAdminAccessStatus") < festival.indexOf("getFestivalAdminSupabase"),
      "admin gate must run before service-role query setup"
    );

    const analytics = fs.readFileSync(
      path.join(root, "app/admin/catalog-analytics/page.tsx"),
      "utf8"
    );
    assert.match(analytics, /getAdminAccessStatus/);
    assert.match(analytics, /redirect\("\/login"\)/);
    assert.match(analytics, /notFound\(\)/);

    const importPage = fs.readFileSync(
      path.join(root, "app/admin/import/page.tsx"),
      "utf8"
    );
    assert.match(importPage, /getAdminAccessStatus/);

    const newPage = fs.readFileSync(
      path.join(root, "app/admin/new/page.tsx"),
      "utf8"
    );
    assert.match(newPage, /getAdminAccessStatus/);
  });
});
