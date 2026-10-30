import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import {
  POSTER_SIMILARITY,
  classifyPosterMae,
  comparePosterUrls,
  enrichNearDuplicatesWithPosterSimilarity,
  formatPosterSimilarityLabel,
  meanAbsoluteError,
  posterCompareGrid,
} from "./poster-similarity.mjs";

async function solidPng(r, g, b) {
  return sharp({
    create: {
      width: 40,
      height: 60,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
}

test("classifyPosterMae thresholds", () => {
  assert.equal(classifyPosterMae(0), POSTER_SIMILARITY.same);
  assert.equal(classifyPosterMae(10), POSTER_SIMILARITY.same);
  assert.equal(classifyPosterMae(20), POSTER_SIMILARITY.similar);
  assert.equal(classifyPosterMae(40), POSTER_SIMILARITY.different);
});

test("identical images have zero MAE", async () => {
  const buf = await solidPng(20, 40, 80);
  const grid = await posterCompareGrid(buf);
  assert.equal(meanAbsoluteError(grid, grid), 0);
});

test("very different solid colors are different", async () => {
  const dark = await posterCompareGrid(await solidPng(0, 0, 0));
  const light = await posterCompareGrid(await solidPng(255, 255, 255));
  const mae = meanAbsoluteError(dark, light);
  assert.ok(mae > 28, `expected large MAE, got ${mae}`);
  assert.equal(classifyPosterMae(mae), POSTER_SIMILARITY.different);
});

test("comparePosterUrls same URL short-circuits", async () => {
  const result = await comparePosterUrls(
    "https://example.com/a.jpg",
    "https://example.com/a.jpg"
  );
  assert.equal(result.verdict, POSTER_SIMILARITY.same);
  assert.equal(result.distance, 0);
});

test("enrichNearDuplicatesWithPosterSimilarity writes verdicts", async () => {
  const red = await solidPng(200, 10, 10);
  const blue = await solidPng(10, 10, 200);
  const store = new Map([
    ["https://x.test/red.png", red],
    ["https://x.test/blue.png", blue],
  ]);

  const fetchImpl = async (url) => ({
    ok: true,
    arrayBuffer: async () => {
      const buf = store.get(url);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  });

  const rows = await enrichNearDuplicatesWithPosterSimilarity(
    [
      {
        review_status: "pending_review",
        poster_url: "https://x.test/red.png",
        possible_catalog_duplicates: [
          {
            id: "1",
            title: "Same",
            year: 2018,
            poster_url: "https://x.test/red.png",
          },
          {
            id: "2",
            title: "Other",
            year: 2019,
            poster_url: "https://x.test/blue.png",
          },
        ],
      },
    ],
    { fetchImpl }
  );

  assert.equal(
    rows[0].possible_catalog_duplicates[0].poster_similarity,
    POSTER_SIMILARITY.same
  );
  assert.equal(
    rows[0].possible_catalog_duplicates[1].poster_similarity,
    POSTER_SIMILARITY.different
  );
  assert.equal(
    formatPosterSimilarityLabel(POSTER_SIMILARITY.different),
    "Different posters"
  );
});
