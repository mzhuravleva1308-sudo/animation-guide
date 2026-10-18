import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessRatingDetail,
  RATING_DETAIL_ALLOWLIST_EMAILS,
} from "./rating-detail-access.mjs";

test("rating detail allowlists the internal email only", () => {
  assert.equal(canAccessRatingDetail("mzhuravleva1308@gmail.com"), true);
  assert.equal(canAccessRatingDetail("MZhuravleva1308@gmail.com"), true);
  assert.equal(canAccessRatingDetail("someone@else.com"), false);
  assert.equal(canAccessRatingDetail(null), false);
  assert.ok(
    RATING_DETAIL_ALLOWLIST_EMAILS.includes("mzhuravleva1308@gmail.com")
  );
});
