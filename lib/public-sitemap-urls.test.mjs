import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUBLIC_FESTIVAL_AWARD_LINKS } from "./festivals/public-festival-award-links.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_INDEX_PATH,
  FESTIVALS_YEAR_PATH,
} from "./festivals/public-festival-paths.mjs";
import { PUBLIC_GUIDE_LINKS } from "./guides/public-guide-links.mjs";
import { WEIRD_ANIMATED_MOVIES_GUIDE } from "./guides/weird-animated-movies.mjs";
import { PUBLIC_SITEMAP_PATHS } from "./public-sitemap-urls.mjs";

describe("PUBLIC_SITEMAP_PATHS", () => {
  it("includes every public editorial guide so articles cannot ship without a sitemap loc", () => {
    for (const guide of PUBLIC_GUIDE_LINKS) {
      assert.equal(
        PUBLIC_SITEMAP_PATHS.includes(guide.href),
        true,
        `missing sitemap path for ${guide.href}`
      );
    }
    assert.equal(
      PUBLIC_SITEMAP_PATHS.includes(`/guides/${WEIRD_ANIMATED_MOVIES_GUIDE.slug}`),
      true
    );
  });

  it("includes the festivals index and every festival award page", () => {
    assert.equal(PUBLIC_SITEMAP_PATHS.includes(FESTIVALS_INDEX_PATH), true);
    for (const festival of PUBLIC_FESTIVAL_AWARD_LINKS) {
      assert.equal(
        PUBLIC_SITEMAP_PATHS.includes(festival.href),
        true,
        `missing sitemap path for ${festival.href}`
      );
    }
    assert.equal(
      PUBLIC_SITEMAP_PATHS.includes("/festivals/2025/annecy"),
      true
    );
    assert.equal(
      PUBLIC_SITEMAP_PATHS.includes("/festivals/2024/annecy"),
      true
    );
  });

  it("includes the current animation festivals year page", () => {
    assert.equal(
      PUBLIC_SITEMAP_PATHS.includes(FESTIVALS_YEAR_PATH(CURRENT_FESTIVAL_YEAR)),
      true
    );
  });

  it("omits legal pages so they are not offered to crawlers", () => {
    assert.equal(PUBLIC_SITEMAP_PATHS.includes("/privacy"), false);
    assert.equal(PUBLIC_SITEMAP_PATHS.includes("/contact"), false);
  });
});
