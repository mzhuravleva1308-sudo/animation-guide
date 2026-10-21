import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUBLIC_FESTIVAL_AWARD_LINKS } from "./public-festival-award-links.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_ANNECY_PATH,
  FESTIVALS_OTTAWA_PATH,
} from "./public-festival-paths.mjs";

describe("PUBLIC_FESTIVAL_AWARD_LINKS", () => {
  it("lists major festival award pages for the festivals index", () => {
    assert.deepEqual(
      PUBLIC_FESTIVAL_AWARD_LINKS.map((festival) => festival.href),
      [
        FESTIVALS_ANNECY_PATH(CURRENT_FESTIVAL_YEAR),
        FESTIVALS_OTTAWA_PATH(CURRENT_FESTIVAL_YEAR),
      ]
    );
    assert.equal(PUBLIC_FESTIVAL_AWARD_LINKS[0].slug, "annecy");
    assert.equal(PUBLIC_FESTIVAL_AWARD_LINKS[0].coverTitle, "The Violinist");
    assert.equal(PUBLIC_FESTIVAL_AWARD_LINKS[1].slug, "ottawa");
    assert.equal(PUBLIC_FESTIVAL_AWARD_LINKS[1].coverTitle, "We Are Aliens");
  });
});
