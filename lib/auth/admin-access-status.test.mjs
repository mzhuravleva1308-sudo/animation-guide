import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAdminAccessStatus } from "./admin-access-status.mjs";

describe("resolveAdminAccessStatus", () => {
  const adminId = "11111111-1111-1111-1111-111111111111";

  it("returns unauthenticated when user id is missing", () => {
    assert.equal(resolveAdminAccessStatus(null, adminId), "unauthenticated");
    assert.equal(resolveAdminAccessStatus(undefined, adminId), "unauthenticated");
    assert.equal(resolveAdminAccessStatus("", adminId), "unauthenticated");
  });

  it("denies by default when ADMIN_USER_ID is missing", () => {
    assert.equal(
      resolveAdminAccessStatus(adminId, undefined),
      "authenticated_non_admin"
    );
    assert.equal(
      resolveAdminAccessStatus(adminId, ""),
      "authenticated_non_admin"
    );
    assert.equal(
      resolveAdminAccessStatus(adminId, "   "),
      "authenticated_non_admin"
    );
  });

  it("returns authenticated_non_admin for a different user", () => {
    assert.equal(
      resolveAdminAccessStatus("22222222-2222-2222-2222-222222222222", adminId),
      "authenticated_non_admin"
    );
  });

  it("returns admin only on exact user id match", () => {
    assert.equal(resolveAdminAccessStatus(adminId, adminId), "admin");
    assert.equal(
      resolveAdminAccessStatus(adminId, ` ${adminId} `),
      "admin"
    );
  });
});
