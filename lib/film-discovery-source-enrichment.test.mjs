import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySourceUrlKind,
  enrichCandidateSourceUrls,
  isBlockedSourceHost,
  isUsefulSourceUrl,
  selectSourceUrls,
  sourceUrlRank,
} from "./film-discovery-source-enrichment.mjs";

test("blocks social and streaming hosts", () => {
  assert.equal(isBlockedSourceHost("https://www.youtube.com/watch?v=x"), true);
  assert.equal(isBlockedSourceHost("https://letterboxd.com/film/x"), true);
  assert.equal(isUsefulSourceUrl("https://www.imdb.com/title/tt1"), false);
  assert.equal(isUsefulSourceUrl("https://en.wikipedia.org/wiki/X"), false);
});

test("classifies festival / studio / editorial kinds", () => {
  assert.equal(
    classifySourceUrlKind(
      "https://www.berlinale.de/en/2023/programme/202314680.html"
    ),
    "festival"
  );
  assert.equal(
    classifySourceUrlKind("https://gkids.com/films/aya-of-yop-city/"),
    "studio_or_film"
  );
  assert.equal(
    classifySourceUrlKind(
      "https://www.cartoonbrew.com/feature-film/art-college-1994-liu-jian-berlin-225618.html"
    ),
    "animation_editorial"
  );
  assert.equal(
    classifySourceUrlKind("https://www.allocine.fr/film/fichefilm-194895/box-office/"),
    "weak"
  );
  assert.equal(isUsefulSourceUrl("https://www.allocine.fr/film/fichefilm-194895/"), false);
});

test("selectSourceUrls prefers festival + studio + animation editorial mix", () => {
  const selected = selectSourceUrls([
    "https://variety.com/2023/film/news/sydney-film-festival-bumper-lineup-1235608281/",
    "https://www.cartoonbrew.com/feature-film/art-college-1994-liu-jian-berlin-225618.html",
    "https://www.berlinale.de/en/2023/programme/202314680.html",
    "https://gkids.com/films/aya-of-yop-city/",
    "https://www.allocine.fr/film/fichefilm-194895/box-office/",
  ]);
  assert.ok(selected.length <= 3);
  assert.ok(
    selected.some((url) => classifySourceUrlKind(url) === "festival")
  );
  assert.ok(
    selected.some((url) => classifySourceUrlKind(url) === "studio_or_film")
  );
  assert.ok(
    selected.some((url) => classifySourceUrlKind(url) === "animation_editorial")
  );
  assert.equal(
    selected.some((url) => /allocine|variety\.com\/2023\/film\/news/i.test(url)),
    false
  );
  assert.ok(sourceUrlRank(selected[0]) <= 1);
});

test("enrichCandidateSourceUrls uses TMDB homepage and skips inventing URLs", async () => {
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes("/search/movie")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 1,
              title: "Padak",
              original_title: "Padak",
              release_date: "2012-11-07",
              original_language: "ko",
            },
          ],
        }),
      };
    }
    if (href.includes("/movie/1?")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          title: "Padak",
          original_title: "Padak",
          release_date: "2012-11-07",
          homepage: "https://studio.example/films/padak",
          credits: { crew: [{ job: "Director", name: "Dir" }] },
          videos: { results: [] },
        }),
      };
    }
    throw new Error(`unexpected ${href}`);
  };

  const result = await enrichCandidateSourceUrls(
    {
      title: "Padak",
      year: 2012,
      directors: ["Dir"],
      source_urls: [],
    },
    {
      tmdbApiKey: "test",
      fetchImpl,
      enableWikipedia: false,
      enableProbe: false,
    }
  );
  assert.deepEqual(result.source_urls, ["https://studio.example/films/padak"]);
  assert.equal(classifySourceUrlKind(result.source_urls[0]), "studio_or_film");
  assert.equal(result.changed, true);
  assert.ok(result.notes.includes("tmdb_homepage"));
});

test("enrichCandidateSourceUrls reuses combined Wikipedia page.extlinks", async () => {
  /** @type {string[]} */
  const wikiUrls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    if (!href.includes("wikipedia.org")) {
      throw new Error(`unexpected ${href}`);
    }
    wikiUrls.push(href);
    if (href.includes("list=search") || href.includes("srsearch")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          query: { search: [{ title: "Padak (film)" }] },
        }),
      };
    }
    assert.match(href, /prop=extracts/);
    assert.equal(href.includes("prop=extlinks") && !href.includes("extracts"), false);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        query: {
          pages: {
            1: {
              title: "Padak (film)",
              fullurl: "https://en.wikipedia.org/wiki/Padak_(film)",
              extract:
                "Padak is a 2012 South Korean animated feature film directed by Dir about fish in a tank.",
              extlinks: [
                { "*": "https://gkids.com/films/padak/" },
                { "*": "https://www.youtube.com/watch?v=x" },
              ],
            },
          },
        },
      }),
    };
  };

  const result = await enrichCandidateSourceUrls(
    {
      title: "Padak",
      year: 2012,
      directors: ["Dir"],
      source_urls: [],
    },
    {
      fetchImpl,
      enableWikipedia: true,
      enableProbe: false,
      delayMs: 0,
    }
  );

  assert.deepEqual(result.source_urls, ["https://gkids.com/films/padak/"]);
  assert.ok(result.notes.some((n) => n.startsWith("wikipedia_extlinks:")));
  // Search + one combined page fetch only — no separate extlinks call.
  assert.equal(wikiUrls.filter((u) => u.includes("prop=")).length, 1);
});
