import test from "node:test";
import assert from "node:assert/strict";
import {
  TRAILER_SOURCE_AUTO,
  TRAILER_SOURCE_MANUAL,
  buildAutoTrailerWritePayload,
  buildManualTrailerWritePayload,
  shouldAttemptTrailerLookup,
} from "./trailer-fill-policy.mjs";

test("empty trailer_url is eligible for automatic fill", () => {
  assert.equal(
    shouldAttemptTrailerLookup({ trailer_url: null, trailer_source: null }),
    true
  );
});

test("manual trailer survives repeated fill-trailers run without force", () => {
  const film = {
    trailer_url: "https://www.youtube.com/watch?v=M2JxMF6F2ek",
    trailer_source: TRAILER_SOURCE_MANUAL,
  };

  assert.equal(shouldAttemptTrailerLookup(film, { force: false }), false);
  assert.equal(shouldAttemptTrailerLookup(film, { force: true }), false);
});

test("unmarked existing trailer is treated as protected, not auto", () => {
  const film = {
    trailer_url: "https://www.youtube.com/watch?v=legacy",
    trailer_source: null,
  };

  assert.equal(shouldAttemptTrailerLookup(film, { force: false }), false);
  assert.equal(shouldAttemptTrailerLookup(film, { force: true }), false);
});

test("auto trailer can be refreshed only with explicit --force", () => {
  const film = {
    trailer_url: "https://www.youtube.com/watch?v=auto123",
    trailer_source: TRAILER_SOURCE_AUTO,
  };

  assert.equal(shouldAttemptTrailerLookup(film, { force: false }), false);
  assert.equal(shouldAttemptTrailerLookup(film, { force: true }), true);
});

test("auto write payload marks source as auto", () => {
  assert.deepEqual(
    buildAutoTrailerWritePayload({
      url: "https://www.youtube.com/watch?v=abc",
      provider: "youtube",
      video_id: "abc",
    }),
    {
      trailer_url: "https://www.youtube.com/watch?v=abc",
      trailer_provider: "youtube",
      trailer_video_id: "abc",
      trailer_source: TRAILER_SOURCE_AUTO,
    }
  );
});

test("manual write payload marks source as manual", () => {
  assert.deepEqual(
    buildManualTrailerWritePayload({
      url: "https://www.youtube.com/watch?v=M2JxMF6F2ek",
      videoId: "M2JxMF6F2ek",
    }),
    {
      trailer_url: "https://www.youtube.com/watch?v=M2JxMF6F2ek",
      trailer_provider: "youtube",
      trailer_video_id: "M2JxMF6F2ek",
      trailer_source: TRAILER_SOURCE_MANUAL,
    }
  );
});
