import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessVibeSearch,
  VIBE_SEARCH_ALLOWLIST_EMAILS,
} from "./vibe-search-access.mjs";

test("vibe search is open to every signed-in email (allowlist retired)", () => {
  assert.deepEqual(VIBE_SEARCH_ALLOWLIST_EMAILS, []);
  assert.equal(canAccessVibeSearch("someone@else.com"), true);
  assert.equal(canAccessVibeSearch("mzhuravleva1308@gmail.com"), true);
  assert.equal(canAccessVibeSearch("MZhuravleva1308@gmail.com"), true);
  assert.equal(canAccessVibeSearch(null), false);
  assert.equal(canAccessVibeSearch(""), false);
  assert.equal(canAccessVibeSearch("   "), false);
});
