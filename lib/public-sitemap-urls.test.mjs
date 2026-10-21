import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENT_FESTIVAL_YEAR,
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

  it("includes the current animation festivals year page", () => {
    assert.equal(
      PUBLIC_SITEMAP_PATHS.includes(FESTIVALS_YEAR_PATH(CURRENT_FESTIVAL_YEAR)),
      true
    );
  });

  it("includes Annecy feature awards for the current festival year", () => {
    assert.equal(
      PUBLIC_SITEMAP_PATHS.includes(`/festivals/${CURRENT_FESTIVAL_YEAR}/annecy`),
      true
    );
  });

  it("omits legal pages so they are not offered to crawlers", () => {
    assert.equal(PUBLIC_SITEMAP_PATHS.includes("/privacy"), false);
    assert.equal(PUBLIC_SITEMAP_PATHS.includes("/contact"), false);
  });
});
