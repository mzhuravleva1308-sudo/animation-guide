import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyTrailerVideo,
  selectBestTrailerVideo,
} from "./tmdb-trailer-selection.mjs";

const movie = {
  production_companies: [{ name: "Giant Ant" }],
  director_names: ["Leah Nelson"],
};

function video(overrides = {}) {
  return {
    key: "video-key",
    name: "Tangles",
    site: "YouTube",
    type: "Trailer",
    official: true,
    ...overrides,
  };
}

test("prioritizes official Trailer over Teaser and Clip", async () => {
  const selected = await selectBestTrailerVideo({
    videos: {
      results: [
        video({ key: "clip", type: "Clip" }),
        video({ key: "teaser", type: "Teaser" }),
        video({ key: "trailer", type: "Trailer" }),
      ],
    },
  });

  assert.equal(selected.video.key, "trailer");
  assert.equal(selected.kind, "Trailer");
});

test("prioritizes non-official Trailer over official Teaser", async () => {
  const selected = await selectBestTrailerVideo({
    videos: {
      results: [
        video({ key: "teaser", type: "Teaser", official: true }),
        video({ key: "trailer", type: "Trailer", official: false }),
      ],
    },
  });

  assert.equal(selected.video.key, "trailer");
  assert.equal(selected.kind, "Trailer");
  assert.match(selected.sourceReason, /identity-confirmed/);
});

test("uses official Teaser only when no Trailer exists", async () => {
  const selected = await selectBestTrailerVideo({
    videos: {
      results: [
        video({ key: "teaser", type: "Teaser", official: true }),
        video({ key: "featurette", type: "Featurette", official: true }),
      ],
    },
  });

  assert.equal(selected.video.key, "teaser");
  assert.equal(selected.kind, "Teaser");
});

test("rejects Featurette as a trailer candidate", () => {
  assert.equal(
    classifyTrailerVideo(
      video({ key: "feat", type: "Featurette", official: true })
    ),
    null
  );
});

test("prefers English Trailer among equal official Trailers", async () => {
  const selected = await selectBestTrailerVideo({
    videos: {
      results: [
        video({ key: "fr", type: "Trailer", official: true, iso_639_1: "fr" }),
        video({ key: "en", type: "Trailer", official: true, iso_639_1: "en" }),
      ],
    },
  });

  assert.equal(selected.video.key, "en");
});

test("allowClip=false skips Clip after missing Trailer/Teaser", async () => {
  const selected = await selectBestTrailerVideo(
    {
      videos: {
        results: [video({ key: "clip", type: "Clip", official: true })],
      },
    },
    { allowClip: false }
  );

  assert.equal(selected, null);
});

test("keeps the In Waves official French Trailer", async () => {
  const selected = await selectBestTrailerVideo({
    videos: {
      results: [
        {
          key: "njvwK8_TSZo",
          name: "[Bande-annonce] In Waves",
          type: "Trailer",
          site: "YouTube",
          official: true,
          iso_639_1: "fr",
          published_at: "2026-06-16T13:55:09.000Z",
        },
      ],
    },
  });

  assert.equal(selected.video.key, "njvwK8_TSZo");
  assert.equal(selected.kind, "Trailer");
});

test("prioritizes official Teaser over official Clip", async () => {
  const selected = await selectBestTrailerVideo({
    videos: {
      results: [
        video({ key: "clip", type: "Clip" }),
        video({ key: "teaser", type: "Teaser" }),
      ],
    },
  });

  assert.equal(selected.video.key, "teaser");
  assert.equal(selected.kind, "Teaser");
});

test("prioritizes official Clip over a non-official Clip", async () => {
  const selected = await selectBestTrailerVideo({
    videos: {
      results: [
        video({
          key: "unofficial-clip",
          type: "Clip",
          official: false,
        }),
        video({ key: "official-clip", type: "Clip" }),
      ],
    },
    ...movie,
  }, {
    resolveChannel: async () => "Untrusted Channel",
  });

  assert.equal(selected.video.key, "official-clip");
  assert.equal(selected.kind, "Clip");
});

test("accepts an unofficial Clip from a verified distributor channel", async () => {
  const selected = await selectBestTrailerVideo(
    {
      ...movie,
      videos: {
        results: [
          video({
            key: "xn2ICP5tGqQ",
            name: "TANGLES - Clip",
            type: "Trailer",
            official: false,
          }),
        ],
      },
    },
    { resolveChannel: async () => "CHARADES FILMS" }
  );

  assert.equal(selected.video.key, "xn2ICP5tGqQ");
  assert.equal(selected.kind, "Clip");
});

test("rejects an unofficial Clip from an untrusted channel", async () => {
  const selected = await selectBestTrailerVideo(
    {
      ...movie,
      videos: {
        results: [
          video({
            key: "untrusted-clip",
            type: "Clip",
            official: false,
          }),
        ],
      },
    },
    { resolveChannel: async () => "Random Reviews Channel" }
  );

  assert.equal(selected, null);
});

test("does not classify interviews or reviews as clips", () => {
  assert.equal(
    classifyTrailerVideo(video({ name: "Tangles Interview", type: "Clip" })),
    null
  );
  assert.equal(
    classifyTrailerVideo(video({ name: "Tangles Review", type: "Clip" })),
    null
  );
});
