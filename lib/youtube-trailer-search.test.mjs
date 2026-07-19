import test from "node:test";
import assert from "node:assert/strict";
import {
  buildYoutubeTrailerQueries,
  buildYoutubeWatchUrl,
  classifyYoutubeChannelAuthority,
  hasOfficialTeaserWording,
  hasOfficialTrailerWording,
  isAmbiguousFilmTitle,
  isExcludedYoutubeTrailerCandidate,
  scoreYoutubeTrailerCandidate,
  searchYoutubeTrailers,
  selectBestYoutubeTrailer,
} from "./youtube-trailer-search.mjs";
import {
  TRAILER_SOURCE_MANUAL,
  shouldAttemptTrailerLookup,
} from "./trailer-fill-policy.mjs";

const squareFilm = {
  title: "The Square",
  original_title: "Gwang-jang",
  year: 2024,
  director: "Bo-Sol Kim",
  country: "South Korea",
};

const tanaFilm = {
  title: "Tana",
  original_title: "Tana",
  year: 2026,
  director: "Ji Zhao, Ke Er Zhu",
  country: "China",
  synopsis:
    "In a remote mountain village, a family faces the tension between tradition and a changing world.",
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
  assert.equal(isAmbiguousFilmTitle("Tana"), true);
  assert.equal(
    isAmbiguousFilmTitle("Little Amélie or the Character of Rain"),
    false
  );
});

test("builds title, original title, teaser recall, and animation queries for ambiguous films", () => {
  const queries = buildYoutubeTrailerQueries(squareFilm);

  assert.deepEqual(queries, [
    "The Square 2024 official trailer",
    "The Square 2024 official teaser",
    "Gwang-jang 2024 trailer",
    "Gwang-jang 2024 teaser",
    "The Square 2024 animation official trailer",
    "The Square 2024 animated trailer",
  ]);
});

test("recognizes localized official trailer and teaser wording", () => {
  assert.equal(
    hasOfficialTeaserWording("La violinista – Teaser Trailer Ufficiale | Al Cinema"),
    true
  );
  assert.equal(
    hasOfficialTrailerWording("Bande-annonce officielle"),
    true
  );
  assert.equal(hasOfficialTrailerWording("Tráiler oficial"), true);
  assert.equal(hasOfficialTrailerWording("Offizieller Trailer"), true);
});

test("The Violinist localized Teaser Trailer Ufficiale is accepted via original_title", () => {
  const evaluation = scoreYoutubeTrailerCandidate(
    {
      title: "The Violinist",
      original_title: "La Violinista",
      year: 2026,
      director: "Ervin Han, Raúl García",
      country: "Singapore, Spain, Italy",
    },
    {
      videoId: "MXcS1R3c_B0",
      title: "La violinista – Teaser Trailer Ufficiale | Al Cinema",
      description:
        "È stato rilasciato il teaser trailer ufficiale de La violinista, in arrivo al cinema nel 2026.",
      channelTitle: "Pressview",
      publishedAt: "2026-06-21T08:42:30Z",
    }
  );

  assert.equal(evaluation.accepted, true);
  assert.ok(evaluation.strongConfirmations.includes("original_title"));
  assert.match(evaluation.reasons.join(" "), /official (teaser|trailer) wording/i);
});

test("ambiguous short title with localized official wording but no strong confirmation is rejected", () => {
  const evaluation = scoreYoutubeTrailerCandidate(
    {
      title: "Tana",
      original_title: "Tana",
      year: 2026,
      director: "Ji Zhao, Ke Er Zhu",
      country: "China",
    },
    {
      videoId: "weak-local",
      title: "Tana – Teaser Trailer Ufficiale",
      description: "Un teaser trailer ufficiale.",
      channelTitle: "Random Uploads",
      publishedAt: "2026-03-01T00:00:00Z",
    }
  );

  assert.equal(evaluation.accepted, false);
  assert.equal(evaluation.strongConfirmations.length, 0);
  assert.match(
    evaluation.reasons.join(" "),
    /ambiguous title needs strong confirmation/i
  );
});

test("hard-rejects gacha meme amv edit fan animation reaction gameplay", () => {
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({
        title: "Tiana Tana is a silly girl | Animation | Meme",
        channelTitle: "Tiana Tana Animake",
      })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({ title: "Tana Gacha Life trailer" })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({ title: "Tana AMV", description: "fan animation edit" })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(
      candidate({ title: "Tana gameplay walkthrough" })
    ),
    true
  );
  assert.equal(
    isExcludedYoutubeTrailerCandidate(candidate()),
    false
  );
});

test("Tana gacha/meme result is rejected even with exact title match", () => {
  const evaluation = scoreYoutubeTrailerCandidate(tanaFilm, {
    videoId: "0TzV9LjPd0g",
    title: "Tiana Tana is a silly girl | Animation | Meme | #tianatanaanimake",
    description: "gacha animation meme",
    channelTitle: "Tiana Tana Animake",
    publishedAt: "2025-06-01T00:00:00Z",
  });

  assert.equal(evaluation.accepted, false);
  assert.match(evaluation.reasons.join(" "), /hard-rejected/i);
});

test("exact short title without strong confirmation is rejected", () => {
  const evaluation = scoreYoutubeTrailerCandidate(tanaFilm, {
    videoId: "weak",
    title: "Tana 2026 Official Trailer Animation",
    description: "An animated film called Tana.",
    channelTitle: "Random Uploads",
    publishedAt: "2026-01-01T00:00:00Z",
  });

  assert.equal(evaluation.accepted, false);
  assert.match(
    evaluation.reasons.join(" "),
    /ambiguous title needs strong confirmation/i
  );
});

test("exact short title + official festival channel is accepted", () => {
  const evaluation = scoreYoutubeTrailerCandidate(tanaFilm, {
    videoId: "fest",
    title: "Tana 2026 Official Trailer",
    description: "Selection at Annecy International Animation Film Festival",
    channelTitle: "Annecy Festival",
    publishedAt: "2026-05-01T00:00:00Z",
  });

  assert.equal(evaluation.accepted, true);
  assert.equal(evaluation.channelAuthority.tier, "festival");
  assert.ok(evaluation.strongConfirmations.includes("official_festival_channel"));
});

test("exact short title + director in description is accepted", () => {
  const evaluation = scoreYoutubeTrailerCandidate(tanaFilm, {
    videoId: "dir",
    title: "Tana (2026) Official Trailer",
    description: "Directed by Ji Zhao and Ke Er Zhu. Animated feature from China.",
    channelTitle: "Indie Film Channel",
    publishedAt: "2026-04-01T00:00:00Z",
  });

  assert.equal(evaluation.accepted, true);
  assert.ok(
    evaluation.strongConfirmations.some((item) => item.startsWith("director:"))
  );
});

test("long unique titles still accept strong official trailers", () => {
  const selected = selectBestYoutubeTrailer(
    {
      title: "Olivia and the Invisible Earthquake",
      original_title: "L'Olívia i el terratrèmol invisible",
      year: 2025,
      director: "Irene Iborra Rizo",
      country: "Spain",
    },
    [
      {
        videoId: "olivia1",
        title: "Olivia and the Invisible Earthquake 2025 Official Trailer",
        description: "Stop-motion animated feature",
        channelTitle: "Alliance Media & Entertainment",
        publishedAt: "2025-03-01T00:00:00Z",
      },
    ]
  );

  assert.equal(selected?.video_id, "olivia1");
});

test("existing manual or unmarked trailer is not overwritten by autofill policy", () => {
  assert.equal(
    shouldAttemptTrailerLookup(
      {
        trailer_url: "https://www.youtube.com/watch?v=M2JxMF6F2ek",
        trailer_source: TRAILER_SOURCE_MANUAL,
      },
      { force: false }
    ),
    false
  );
  assert.equal(
    shouldAttemptTrailerLookup(
      {
        trailer_url: "https://www.youtube.com/watch?v=M2JxMF6F2ek",
        trailer_source: TRAILER_SOURCE_MANUAL,
      },
      { force: true }
    ),
    false
  );
  assert.equal(
    shouldAttemptTrailerLookup(
      {
        trailer_url: "https://www.youtube.com/watch?v=legacy",
        trailer_source: null,
      },
      { force: true }
    ),
    false
  );
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
  assert.equal(isExcludedYoutubeTrailerCandidate(candidate()), false);
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
  assert.equal(selected.url, "https://www.youtube.com/watch?v=right");
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

test("uses channel authority as tie-break when scores are equal", () => {
  const selected = selectBestYoutubeTrailer(squareFilm, [
    {
      videoId: "blog-hit",
      title: "The Square | Movie Trailer",
      description: "Bo-Sol Kim animated feature trailer from South Korea",
      channelTitle: "VIMooZ Blog",
      publishedAt: "2025-06-19T18:26:35Z",
    },
    {
      videoId: "festival-hit",
      title: "The Square | FEFF27 Trailer",
      description: "Bo-Sol Kim animated feature trailer from South Korea",
      channelTitle: "Far East Film Festival 28",
      publishedAt: "2025-04-17T15:02:50Z",
    },
  ]);

  assert.equal(
    classifyYoutubeChannelAuthority("Far East Film Festival 28").tier,
    "festival"
  );
  assert.equal(classifyYoutubeChannelAuthority("VIMooZ Blog").tier, "other");
  assert.equal(selected.video_id, "festival-hit");
  assert.equal(selected.channelAuthority.tier, "festival");
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
                    description: "Annecy animated feature by Bo-Sol Kim",
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

  assert.equal(calls.length, 6);
  assert.equal(result.provider, "youtube");
  assert.equal(result.video_id, "anim-hit");
  assert.equal(result.url, "https://www.youtube.com/watch?v=anim-hit");
  assert.equal(result.url.includes("mqdefault"), false);
});
