import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWatchAvailabilityFromTmdbResults,
  formatWatchRegions,
  groupWatchOffersByCountry,
  isWatchAvailabilityStale,
  matchWatchProvider,
  normalizeWatchAvailability,
  watchOfferTypeLabel,
  watchRegionDisplayName,
} from "./film-watch-availability.mjs";

test("matchWatchProvider keeps MUBI and drops Amazon Channel add-ons", () => {
  assert.deepEqual(matchWatchProvider("MUBI"), { name: "MUBI", rank: 1 });
  assert.equal(matchWatchProvider("HBO Max Amazon Channel"), null);
  assert.deepEqual(matchWatchProvider("Apple TV Store"), {
    name: "Apple TV",
    rank: 20,
  });
});

test("buildWatchAvailabilityFromTmdbResults aggregates regions per provider", () => {
  const availability = buildWatchAvailabilityFromTmdbResults(
    {
      US: {
        flatrate: [{ provider_name: "MUBI" }, { provider_name: "Netflix" }],
        buy: [{ provider_name: "Apple TV Store" }],
      },
      FR: {
        flatrate: [{ provider_name: "MUBI" }],
        rent: [{ provider_name: "Apple TV Store" }],
      },
      DE: {
        ads: [{ provider_name: "Tubi TV" }],
      },
    },
    { tmdbId: 123, checkedAt: "2026-11-02T00:00:00.000Z" }
  );

  assert.equal(availability.source, "tmdb");
  assert.equal(availability.tmdb_id, 123);
  assert.deepEqual(
    availability.offers.find((o) => o.provider === "MUBI"),
    { provider: "MUBI", type: "flatrate", regions: ["FR", "US"] }
  );
  assert.deepEqual(
    availability.offers.find((o) => o.provider === "Apple TV" && o.type === "buy"),
    { provider: "Apple TV", type: "buy", regions: ["US"] }
  );
  assert.ok(availability.offers.some((o) => o.provider === "Tubi"));
});

test("normalizeWatchAvailability rejects junk", () => {
  assert.equal(normalizeWatchAvailability(null), null);
  assert.equal(normalizeWatchAvailability({ source: "tmdb", offers: [] })?.offers.length, 0);
  const ok = normalizeWatchAvailability({
    source: "tmdb",
    checked_at: "2026-11-02T00:00:00.000Z",
    tmdb_id: 1,
    offers: [
      { provider: "MUBI", type: "flatrate", regions: ["fr", "US", "FR"] },
      { provider: "Bad", type: "stream", regions: ["US"] },
    ],
  });
  assert.deepEqual(ok?.offers, [
    { provider: "MUBI", type: "flatrate", regions: ["FR", "US"] },
  ]);
});

test("isWatchAvailabilityStale after one week", () => {
  const now = Date.parse("2026-11-02T12:00:00.000Z");
  assert.equal(
    isWatchAvailabilityStale("2026-10-20T12:00:00.000Z", { now }),
    true
  );
  assert.equal(
    isWatchAvailabilityStale("2026-10-30T12:00:00.000Z", { now }),
    false
  );
  assert.equal(isWatchAvailabilityStale(null, { now }), true);
});

test("format helpers", () => {
  assert.equal(watchOfferTypeLabel("flatrate"), "stream");
  assert.equal(formatWatchRegions(["US", "FR", "DE"]), "US, FR, DE");
  assert.equal(
    formatWatchRegions(["US", "FR", "DE", "GB", "PL", "IT", "ES", "NL", "BE"], 3),
    "US, FR, DE +6"
  );
  assert.equal(watchRegionDisplayName("FR"), "France");
  assert.equal(watchRegionDisplayName("US"), "United States");
});

test("groupWatchOffersByCountry sorts countries A-Z with services", () => {
  const grouped = groupWatchOffersByCountry([
    { provider: "MUBI", type: "flatrate", regions: ["US", "FR"] },
    { provider: "Apple TV", type: "buy", regions: ["FR"] },
    { provider: "Netflix", type: "flatrate", regions: ["DE"] },
  ]);
  assert.deepEqual(
    grouped.map((row) => row.name),
    ["France", "Germany", "United States"]
  );
  assert.deepEqual(
    grouped.find((row) => row.code === "FR")?.services,
    [
      { provider: "MUBI", type: "flatrate", url: null },
      { provider: "Apple TV", type: "buy", url: null },
    ]
  );

  const withApple = groupWatchOffersByCountry(
    [{ provider: "Apple TV", type: "buy", regions: ["FR"] }],
    { appleLinksByRegion: { FR: "https://tv.apple.com/fr/movie/x" } }
  );
  assert.equal(
    withApple[0]?.services[0]?.url,
    "https://tv.apple.com/fr/movie/x"
  );
});
