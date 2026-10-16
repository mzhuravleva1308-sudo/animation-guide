import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessVibeSearch,
  VIBE_SEARCH_ALLOWLIST_EMAILS,
} from "./vibe-search-access.mjs";

test("vibe search allowlists the internal email only", () => {
  assert.equal(canAccessVibeSearch("mzhuravleva1308@gmail.com"), true);
  assert.equal(canAccessVibeSearch("MZhuravleva1308@gmail.com"), true);
  assert.equal(canAccessVibeSearch("someone@else.com"), false);
  assert.equal(canAccessVibeSearch(null), false);
  assert.ok(
    VIBE_SEARCH_ALLOWLIST_EMAILS.includes("mzhuravleva1308@gmail.com")
  );
});
