import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessLiveActionCatalog,
  LIVE_ACTION_CATALOG_ALLOWLIST_EMAILS,
} from "./live-action-catalog-access.mjs";
import {
  MEDIA_TYPE,
  SCORE_MODE,
  parseCatalogRankingParams,
} from "./media-type.mjs";
import { countLikedHighRatingsForRanking } from "./profile-film-scoring.mjs";

describe("live-action catalog allowlist", () => {
  it("allows only the configured early-access email", () => {
    assert.equal(
      canAccessLiveActionCatalog("mzhuravleva1308@gmail.com"),
      true
    );
    assert.equal(
      canAccessLiveActionCatalog("MZhuravleva1308@gmail.com"),
      true
    );
    assert.equal(canAccessLiveActionCatalog("someone@else.com"), false);
    assert.equal(canAccessLiveActionCatalog(null), false);
    assert.ok(LIVE_ACTION_CATALOG_ALLOWLIST_EMAILS.includes("mzhuravleva1308@gmail.com"));
  });
});

describe("parseCatalogRankingParams", () => {
  it("defaults to native animation ranking", () => {
    assert.deepEqual(parseCatalogRankingParams({}), {
      mediaType: MEDIA_TYPE.animation,
      scoreMode: SCORE_MODE.native,
      sourceMedia: MEDIA_TYPE.animation,
      sortParam: "native",
    });
  });

  it("parses cross-from-animation on live-action catalog", () => {
    assert.deepEqual(
      parseCatalogRankingParams({
        media: "live_action",
        sort: "cross_from_animation",
      }),
      {
        mediaType: MEDIA_TYPE.liveAction,
        scoreMode: SCORE_MODE.crossMedia,
        sourceMedia: MEDIA_TYPE.animation,
        sortParam: "cross_from_animation",
      }
    );
  });
});

describe("countLikedHighRatingsForRanking", () => {
  const ratings = [
    { film_id: "a", rating: 9, media_type: "animation" },
    { film_id: "b", rating: 8, media_type: "live_action" },
    { film_id: "c", rating: 6, media_type: "animation" },
  ];

  it("unlocks native ranking only from same-media likes", () => {
    assert.equal(
      countLikedHighRatingsForRanking(ratings, {
        scoreMode: "native",
        mediaType: "animation",
      }),
      1
    );
    assert.equal(
      countLikedHighRatingsForRanking(ratings, {
        scoreMode: "native",
        mediaType: "live_action",
      }),
      1
    );
  });

  it("unlocks cross ranking from source-media likes", () => {
    assert.equal(
      countLikedHighRatingsForRanking(ratings, {
        scoreMode: "cross_media",
        sourceMedia: "animation",
        mediaType: "live_action",
      }),
      1
    );
  });
});
