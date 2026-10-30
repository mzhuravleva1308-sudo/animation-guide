import assert from "node:assert/strict";
import test from "node:test";
import { DISCOVERY_MEDIA_STATUS } from "./film-discovery.mjs";
import {
  MANUAL_TRAILER_SOURCE_LABEL,
  buildManualDiscoveryTrailerPatch,
} from "./film-discovery-manual-trailer.mjs";
import { TRAILER_SOURCE_MANUAL } from "./trailer-fill-policy.mjs";

test("manual YouTube URL becomes normalized watch link with manual source", () => {
  const patch = buildManualDiscoveryTrailerPatch(
    { poster_url: "https://example.com/p.jpg" },
    "https://youtu.be/M2JxMF6F2ek"
  );

  assert.equal(
    patch.trailer_url,
    "https://www.youtube.com/watch?v=M2JxMF6F2ek"
  );
  assert.equal(patch.trailer_provider, "youtube");
  assert.equal(patch.trailer_video_id, "M2JxMF6F2ek");
  assert.equal(patch.trailer_source, TRAILER_SOURCE_MANUAL);
  assert.equal(patch.trailer_source_label, MANUAL_TRAILER_SOURCE_LABEL);
  assert.equal(patch.media_status, DISCOVERY_MEDIA_STATUS.complete);
  assert.ok(patch.media_updated_at);
});

test("raw video id is accepted", () => {
  const patch = buildManualDiscoveryTrailerPatch(
    { poster_url: null },
    "TS3SrQaRqmg"
  );
  assert.equal(patch.trailer_video_id, "TS3SrQaRqmg");
  assert.equal(patch.media_status, DISCOVERY_MEDIA_STATUS.partial);
});

test("empty input clears trailer and recalculates media status", () => {
  const withPoster = buildManualDiscoveryTrailerPatch(
    { poster_url: "https://example.com/p.jpg" },
    "   "
  );
  assert.equal(withPoster.trailer_url, null);
  assert.equal(withPoster.trailer_source, null);
  assert.equal(withPoster.media_status, DISCOVERY_MEDIA_STATUS.partial);

  const neither = buildManualDiscoveryTrailerPatch({ poster_url: null }, "");
  assert.equal(neither.media_status, DISCOVERY_MEDIA_STATUS.failed);
});

test("Mubi https URL is accepted as manual external trailer", () => {
  const patch = buildManualDiscoveryTrailerPatch(
    { poster_url: "https://example.com/p.jpg" },
    "https://mubi.com/en/films/ville-neuve/trailer"
  );
  assert.equal(
    patch.trailer_url,
    "https://mubi.com/en/films/ville-neuve/trailer"
  );
  assert.equal(patch.trailer_provider, "mubi");
  assert.equal(patch.trailer_video_id, null);
  assert.equal(patch.trailer_source, TRAILER_SOURCE_MANUAL);
  assert.equal(patch.media_status, DISCOVERY_MEDIA_STATUS.complete);
});

test("Vimeo URL is accepted", () => {
  const patch = buildManualDiscoveryTrailerPatch(
    { poster_url: null },
    "https://vimeo.com/123456789"
  );
  assert.equal(patch.trailer_provider, "vimeo");
  assert.equal(patch.trailer_video_id, "123456789");
});

test("garbage input is rejected", () => {
  assert.throws(
    () => buildManualDiscoveryTrailerPatch({ poster_url: null }, "not a url"),
    /Paste a YouTube/
  );
});
