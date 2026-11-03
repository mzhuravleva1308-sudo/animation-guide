import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_WATCH_RECHECK_MAX_AGE_MS,
  isEmptyWatchAvailability,
  isMissingWatchAvailability,
  loadWatchAvailabilityFromTmdb,
  needsEmptyWatchRecheck,
  preserveWatchDeepLinks,
} from "./tmdb-watch-providers.mjs";
import { buildWatchAvailabilityFromTmdbResults } from "./film-watch-availability.mjs";

test("isMissingWatchAvailability treats null and invalid as missing", () => {
  assert.equal(isMissingWatchAvailability(null), true);
  assert.equal(isMissingWatchAvailability({}), true);
  assert.equal(
    isMissingWatchAvailability(
      buildWatchAvailabilityFromTmdbResults(
        {
          US: {
            flatrate: [{ provider_name: "MUBI", provider_id: 1 }],
          },
        },
        { tmdbId: 1 }
      )
    ),
    false
  );
  assert.equal(
    isMissingWatchAvailability(
      buildWatchAvailabilityFromTmdbResults({}, { tmdbId: 1 })
    ),
    false
  );
});

test("needsEmptyWatchRecheck only for aged empty snapshots", () => {
  const emptyFresh = buildWatchAvailabilityFromTmdbResults(
    {},
    { tmdbId: 1, checkedAt: new Date().toISOString() }
  );
  const emptyOld = buildWatchAvailabilityFromTmdbResults(
    {},
    {
      tmdbId: 1,
      checkedAt: new Date(
        Date.now() - EMPTY_WATCH_RECHECK_MAX_AGE_MS - 1000
      ).toISOString(),
    }
  );
  const withOffers = buildWatchAvailabilityFromTmdbResults(
    { US: { flatrate: [{ provider_name: "MUBI", provider_id: 1 }] } },
    {
      tmdbId: 1,
      checkedAt: new Date(
        Date.now() - EMPTY_WATCH_RECHECK_MAX_AGE_MS - 1000
      ).toISOString(),
    }
  );
  assert.equal(isEmptyWatchAvailability(emptyFresh), true);
  assert.equal(needsEmptyWatchRecheck(emptyFresh), false);
  assert.equal(needsEmptyWatchRecheck(emptyOld), true);
  assert.equal(needsEmptyWatchRecheck(withOffers), false);
  assert.equal(needsEmptyWatchRecheck(null), false);
});

test("preserveWatchDeepLinks keeps one-shot link fields", () => {
  const next = buildWatchAvailabilityFromTmdbResults(
    {
      US: { flatrate: [{ provider_name: "MUBI", provider_id: 1 }] },
    },
    { tmdbId: 9 }
  );
  const preserved = preserveWatchDeepLinks(next, {
    source: "tmdb",
    checked_at: "2020-01-01T00:00:00.000Z",
    tmdb_id: 9,
    offers: [],
    mubi_links: {
      checked_at: "2026-01-01T00:00:00.000Z",
      url: "https://mubi.com/films/flow",
      slug: "flow",
    },
    apple_links: null,
    amazon_links: null,
    prime_links: null,
    youtube_links: null,
  });
  assert.equal(preserved.mubi_links?.slug, "flow");
  assert.equal(preserved.offers[0]?.provider, "MUBI");
});

test("loadWatchAvailabilityFromTmdb builds offers from TMDB payload", async () => {
  const availability = await loadWatchAvailabilityFromTmdb({
    tmdbId: 42,
    apiKey: "test",
    fetchImpl: async () =>
      /** @type {Response} */ ({
        ok: true,
        status: 200,
        json: async () => ({
          results: {
            ES: {
              flatrate: [{ provider_name: "Filmin", provider_id: 2 }],
            },
          },
        }),
        text: async () => "",
      }),
  });
  assert.equal(availability.source, "tmdb");
  assert.equal(availability.tmdb_id, 42);
  assert.equal(availability.offers[0]?.provider, "Filmin");
  assert.deepEqual(availability.offers[0]?.regions, ["ES"]);
});
