import test from "node:test";
import assert from "node:assert/strict";
import {
  buildYoutubeTrailerQueries,
  buildYoutubeWatchUrl,
  isAmbiguousFilmTitle,
  isExcludedYoutubeTrailerCandidate,
  scoreYoutubeTrailerCandidate,
  searchYoutubeTrailers,
  selectBestYoutubeTrailer,
} from "./youtube-trailer-search.mjs";

const squareFilm = {
  title: "The Square",
  original_title: "Gwang-jang",
  year: 2024,
  director: "Bo-Sol Kim",
};

function candidate(overrides = {}) {
  return {
    videoId: "abc123",
    title: "The Square (2024) Official Trailer | Animated Feature",
    description: "Official trailer for the animated film The Square.",
    channelTitle: "Annecy Festival",
    publishedAt: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

test("detects ambiguous short titles", () => {
  assert.equal(isAmbiguousFilmTitle("The Square"), true);
  assert.equal(isAmbiguousFilmTitle("ChaO"), true);
  assert.equal(
    isAmbiguousFilmTitle("Little Amélie or the Character of Rain"),
    false
  );
});

test("builds title, original title, and animation queries for ambiguous films", () => {
  const queries = buildYoutubeTrailerQueries(squareFilm);

  assert.deepEqual(queries, [
    "The Square 2024 official trailer",
    "Gwang-jang 2024 trailer",
    "The Square 2024 animation official trailer",
    "The Square 2024 animated trailer",
  ]);
});

test("excludes reviews, reactions, fan trailers, and clips", () => {
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({ title: "The Square (2024) Movie Review" })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({ title: "The Square Trailer Reaction" })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({ title: "The Square Fan Trailer" })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({ title: "The Square - Clip" })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(candidate()),
    false
  );
});

test("ranks official festival trailer above unrelated same-title hit", () => {
  const selected = selectBestYoutubeTrailer(squareFilm, [
    candidate({
      videoId: "wrong",
      title: "The Square (2017) Official Trailer",
      description: "Live-action Palme d'Or winner",
      channelTitle: "Movieclips Trailers",
      publishedAt: "2017-05-01T00:00:00Z",
    }),
    candidate({
      videoId: "right",
      title: "The Square (2024) Official Trailer Animation",
      description: "Animated feature at Annecy",
      channelTitle: "Annecy Festival",
      publishedAt: "2024-05-20T00:00:00Z",
    }),
  ]);

  assert.equal(selected.provider, "youtube");
  assert.equal(selected.video_id, "right");
  assert.equal(
    selected.url,
    "https://www.youtube.com/watch?v=right"
  );
  assert.match(selected.reasons.join(" | "), /official trailer/i);
});

test("rejects ambiguous same-title film without year or animation context", () => {
  const evaluation = scoreYoutubeTrailerCandidate(squareFilm, {
    videoId: "live-action",
    title: "The Square Official Trailer",
    description: "A museum curator invents an artistic installation.",
    channelTitle: "Random Uploads",
    publishedAt: "2017-04-01T00:00:00Z",
  });

  assert.equal(evaluation.accepted, false);
});

test("accepts original-title trailer with year match", () => {
  const selected = selectBestYoutubeTrailer(
    {
      title: "Living Large",
      original_title: "Život k sežrání",
      year: 2024,
      director: "Kristina Dufková",
    },
    [
      {
        videoId: "ll1",
        title: "Život k sežrání (2024) trailer",
        description: "Official animated feature trailer",
        channelTitle: "Czech Film Center",
        publishedAt: "2024-03-01T00:00:00Z",
      },
    ]
  );

  assert.equal(selected?.video_id, "ll1");
  assert.equal(selected?.provider, "youtube");
});

test("buildYoutubeWatchUrl returns canonical watch URL only", () => {
  assert.equal(
    buildYoutubeWatchUrl("M2JxMF6F2ek"),
    "https://www.youtube.com/watch?v=M2JxMF6F2ek"
  );
  assert.equal(buildYoutubeWatchUrl(null), null);
});

test("searchYoutubeTrailers returns null when API key is missing", async () => {
  let called = false;
  const result = await searchYoutubeTrailers({
    apiKey: null,
    film: squareFilm,
    fetchImpl: async () => {
      called = true;
      throw new Error("should not fetch");
    },
  });

  assert.equal(result, null);
  assert.equal(called, false);
});

test("searchYoutubeTrailers searches queries and selects best accepted candidate", async () => {
  const calls = [];
  const result = await searchYoutubeTrailers({
    apiKey: "test-key",
    film: squareFilm,
    fetchImpl: async (url) => {
      calls.push(url);
      const query = new URL(url).searchParams.get("q");
      return {
        ok: true,
        async json() {
          if (query.includes("animation")) {
            return {
              items: [
                {
                  id: { videoId: "anim-hit" },
                  snippet: {
                    title: "The Square 2024 Official Trailer Animation",
                    description: "Annecy animated feature",
                    channelTitle: "Annecy Festival",
                    publishedAt: "2024-05-01T00:00:00Z",
                  },
                },
              ],
            };
          }

          return {
            items: [
              {
                id: { videoId: "review-hit" },
                snippet: {
                  title: "The Square 2024 Review",
                  description: "My thoughts",
                  channelTitle: "Review Channel",
                  publishedAt: "2024-06-01T00:00:00Z",
                },
              },
            ],
          };
        },
      };
    },
  });

  assert.equal(calls.length, 4);
  assert.equal(result.provider, "youtube");
  assert.equal(result.video_id, "anim-hit");
  assert.equal(result.url, "https://www.youtube.com/watch?v=anim-hit");
  assert.equal(result.url.includes("mqdefault"), false);
});
