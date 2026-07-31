import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCacheablePublicCatalogBase,
  isCacheablePublicCatalogBase,
  isPublicCatalogBaseLoadError,
  loadPublicCatalogBaseWithSuccessOnlyCache,
} from "./public-catalog-base-cache.mjs";

function emptyOkBase() {
  return {
    films: [],
    awardWinningFilmIds: [],
    loadError: null,
    filmsMs: 1,
    awardIdsMs: 1,
    festivalBadgesMs: 0,
  };
}

function failedBase(message = "TypeError: fetch failed") {
  return {
    films: [],
    awardWinningFilmIds: [],
    loadError: message,
    filmsMs: 7052,
    awardIdsMs: 7053,
    festivalBadgesMs: 0,
  };
}

function filmsBase(titles) {
  return {
    films: titles.map((title, index) => ({ id: `id-${index}`, title })),
    awardWinningFilmIds: [],
    loadError: null,
    filmsMs: 20,
    awardIdsMs: 5,
    festivalBadgesMs: 1,
  };
}

function memoryCache() {
  /** @type {unknown} */
  let stored = undefined;
  return {
    get: () => stored,
    set: (value) => {
      stored = value;
    },
    peek: () => stored,
  };
}

describe("isCacheablePublicCatalogBase", () => {
  it("treats a successful empty catalog as cacheable", () => {
    assert.equal(isCacheablePublicCatalogBase(emptyOkBase()), true);
  });

  it("treats a technical loadError as not cacheable", () => {
    assert.equal(isCacheablePublicCatalogBase(failedBase()), false);
  });
});

describe("assertCacheablePublicCatalogBase", () => {
  it("returns successful empty catalogs unchanged", () => {
    const empty = emptyOkBase();
    assert.equal(assertCacheablePublicCatalogBase(empty), empty);
  });

  it("throws a recoverable error for failed loads without losing the payload", () => {
    const failed = failedBase();
    try {
      assertCacheablePublicCatalogBase(failed);
      assert.fail("expected throw");
    } catch (error) {
      assert.equal(isPublicCatalogBaseLoadError(error), true);
      assert.equal(error.message, "TypeError: fetch failed");
      assert.deepEqual(error.publicCatalogBase, failed);
    }
  });
});

describe("loadPublicCatalogBaseWithSuccessOnlyCache", () => {
  it("caches a legitimate empty catalog and reuses it", async () => {
    const cache = memoryCache();
    let loads = 0;

    const first = await loadPublicCatalogBaseWithSuccessOnlyCache(async () => {
      loads += 1;
      return emptyOkBase();
    }, cache);

    const second = await loadPublicCatalogBaseWithSuccessOnlyCache(async () => {
      loads += 1;
      return filmsBase(["Should not load"]);
    }, cache);

    assert.equal(loads, 1);
    assert.equal(first.films.length, 0);
    assert.equal(first.loadError, null);
    assert.equal(second, first);
    assert.deepEqual(cache.peek(), first);
  });

  it("does not cache a technical empty failure", async () => {
    const cache = memoryCache();
    let loads = 0;

    const failed = await loadPublicCatalogBaseWithSuccessOnlyCache(async () => {
      loads += 1;
      return failedBase();
    }, cache);

    assert.equal(loads, 1);
    assert.equal(failed.loadError, "TypeError: fetch failed");
    assert.equal(failed.films.length, 0);
    assert.equal(cache.peek(), undefined);
  });

  it("loads films on the next request after Supabase recovers", async () => {
    const cache = memoryCache();
    let loads = 0;

    const failed = await loadPublicCatalogBaseWithSuccessOnlyCache(async () => {
      loads += 1;
      return failedBase();
    }, cache);

    const recovered = await loadPublicCatalogBaseWithSuccessOnlyCache(
      async () => {
        loads += 1;
        return filmsBase(["The Red Turtle", "Lorenzo"]);
      },
      cache
    );

    assert.equal(failed.loadError, "TypeError: fetch failed");
    assert.equal(recovered.loadError, null);
    assert.equal(recovered.films.length, 2);
    assert.equal(recovered.films[0].title, "The Red Turtle");
    assert.equal(loads, 2);
    assert.deepEqual(cache.peek(), recovered);
  });
});
