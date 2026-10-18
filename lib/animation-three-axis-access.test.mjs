import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessAnimationThreeAxis,
  ANIMATION_THREE_AXIS_ALLOWLIST_EMAILS,
} from "./animation-three-axis-access.mjs";

test("animation three-axis allowlists the internal email only", () => {
  assert.equal(canAccessAnimationThreeAxis("mzhuravleva1308@gmail.com"), true);
  assert.equal(canAccessAnimationThreeAxis("MZhuravleva1308@gmail.com"), true);
  assert.equal(canAccessAnimationThreeAxis("someone@else.com"), false);
  assert.equal(canAccessAnimationThreeAxis(null), false);
  assert.ok(
    ANIMATION_THREE_AXIS_ALLOWLIST_EMAILS.includes("mzhuravleva1308@gmail.com")
  );
});
