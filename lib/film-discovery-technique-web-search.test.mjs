import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTechniqueSearchQueries,
  createTechniqueWebSearchState,
  discoverTechniqueUrlsViaWebSearch,
  extractArticleUrlsFromSiteSearchHtml,
  extractUrlsFromDuckDuckGoHtml,
  isTechniqueSearchAllowlistedUrl,
  unwrapDuckDuckGoUrl,
  urlLikelyAboutTitle,
} from "./film-discovery-technique-web-search.mjs";
import { gatherTechniqueResearch } from "./film-discovery-content-research.mjs";

test("unwraps DuckDuckGo uddg redirect URLs", () => {
  const href =
    "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.cartoonbrew.com%2Ffeature-film%2Fpadak-123.html&rut=abc";
  assert.equal(
    unwrapDuckDuckGoUrl(href),
    "https://www.cartoonbrew.com/feature-film/padak-123.html"
  );
});

test("allowlists animation editorial and festival, blocks social", () => {
  assert.equal(
    isTechniqueSearchAllowlistedUrl(
      "https://www.cartoonbrew.com/feature-film/x-123.html"
    ),
    true
  );
  assert.equal(
    isTechniqueSearchAllowlistedUrl(
      "https://www.berlinale.de/en/2023/programme/202314680.html"
    ),
    true
  );
  assert.equal(
    isTechniqueSearchAllowlistedUrl("https://www.youtube.com/watch?v=x"),
    false
  );
  assert.equal(
    isTechniqueSearchAllowlistedUrl("https://www.allocine.fr/film/fichefilm-1/"),
    false
  );
});

test("urlLikelyAboutTitle requires title tokens in slug", () => {
  assert.equal(
    urlLikelyAboutTitle(
      "https://www.cartoonbrew.com/feature-film/julian-glander-boys-go-to-jupiter-248998.html",
      "Boys Go to Jupiter"
    ),
    true
  );
  assert.equal(
    urlLikelyAboutTitle(
      "https://www.cartoonbrew.com/rip/roger-allers-dies-the-lion-kind-director-258299.html",
      "Renaissance"
    ),
    false
  );
  assert.equal(
    urlLikelyAboutTitle(
      "https://www.animationmagazine.net/2022/04/news-bytes-city-of-ghosts-nominated/",
      "Aya of Yop City"
    ),
    false
  );
  assert.equal(
    urlLikelyAboutTitle(
      "https://www.cartoonbrew.com/feature-film/brave-cate-gabirel-osorio-annecy-interview-263358.html",
      "Cat City"
    ),
    false
  );
  assert.equal(
    urlLikelyAboutTitle(
      "https://www.cartoonbrew.com/feature-film/cat-city-macskafogo-restoration-123.html",
      "Cat City"
    ),
    true
  );
});

test("extractUrlsFromDuckDuckGoHtml keeps allowlisted destinations", () => {
  const html = `
    <div class="result">
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.cartoonbrew.com%2Ffeature-film%2Fpadak-123.html">A</a>
    <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dx">B</a>
    <a href="https://gkids.com/films/padak/">C</a>
    </div>
  `;
  const urls = extractUrlsFromDuckDuckGoHtml(html);
  assert.ok(urls.includes("https://www.cartoonbrew.com/feature-film/padak-123.html"));
  assert.ok(urls.includes("https://gkids.com/films/padak/"));
  assert.equal(urls.some((u) => /youtube/i.test(u)), false);
});

test("extractArticleUrlsFromSiteSearchHtml filters by title", () => {
  const html = `
    <a href="https://www.cartoonbrew.com/feature-film/bill-plymptons-cheatin-will-begin-111003.html">A</a>
    <a href="https://www.cartoonbrew.com/feature-film/unrelated-film-999.html">B</a>
  `;
  const urls = extractArticleUrlsFromSiteSearchHtml(
    html,
    /https?:\/\/(?:www\.)?cartoonbrew\.com\/(?:[a-z0-9-]+\/)+[a-z0-9-]+-\d+\.html/gi,
    "Cheatin'"
  );
  assert.deepEqual(urls, [
    "https://www.cartoonbrew.com/feature-film/bill-plymptons-cheatin-will-begin-111003.html",
  ]);
});

test("buildTechniqueSearchQueries prefers short site-search queries", () => {
  const queries = buildTechniqueSearchQueries({
    title: "Padak",
    year: 2012,
    directors: ["Dir"],
  });
  assert.equal(queries[0], "Padak");
  assert.ok(queries[1].includes("Dir"));
});

test("discoverTechniqueUrlsViaWebSearch uses Cartoon Brew site search", async () => {
  const state = createTechniqueWebSearchState({ delayMs: 0 });
  const fetchImpl = async (url) => {
    const href = String(url);
    assert.match(href, /cartoonbrew\.com\/\?s=/);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () =>
        `<html><body>${"x".repeat(1300)}
          <a href="https://www.cartoonbrew.com/feature-film/blood-tea-and-red-string-123.html">Blood Tea</a>
          <a href="https://www.cartoonbrew.com/feature-film/other-film-999.html">Other</a>
        </body></html>`,
    };
  };

  const result = await discoverTechniqueUrlsViaWebSearch(
    {
      title: "Blood Tea and Red String",
      year: 2006,
      directors: ["Christiane Cegavske"],
      source_urls: [],
    },
    { fetchImpl, state, delayMs: 0, maxProviders: 1 }
  );
  assert.equal(result.urls.length, 1);
  assert.match(result.urls[0], /blood-tea/);
  assert.ok(result.researchNotes.some((n) => /cartoonbrew_urls/i.test(n)));
});

test("gatherTechniqueResearch web search can supply editorial evidence", async () => {
  const state = createTechniqueWebSearchState({ delayMs: 0 });
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes("cartoonbrew.com/?s=")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () =>
          `<html><body>${"x".repeat(1300)}
            <a href="https://www.cartoonbrew.com/feature-film/blood-tea-and-red-string-123.html">link</a>
          </body></html>`,
      };
    }
    if (href.includes("cartoonbrew.com/feature-film/blood-tea")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () =>
          `<html><body>${"x".repeat(200)}Blood Tea was created using stop-motion puppet animation by the director.</body></html>`,
      };
    }
    if (href.includes("animationmagazine.net")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => `<html><body>${"x".repeat(1300)}no matches</body></html>`,
      };
    }
    throw new Error(`unexpected ${href}`);
  };

  const result = await gatherTechniqueResearch(
    {
      title: "Blood Tea and Red String",
      year: 2006,
      directors: ["Christiane Cegavske"],
      source_urls: [],
    },
    {
      fetchImpl,
      enableSourceFetch: true,
      enableWikipedia: false,
      enableWebSearch: true,
      delayMs: 0,
      webSearchState: state,
      tmdbOverview: "An indie animated fairy tale.",
    }
  );

  assert.ok(
    result.techniqueEvidence.some((row) => row.label === "stop-motion animation")
  );
  assert.equal(result.usedWebSearch, true);
  assert.ok(result.researchNotes.some((n) => /web_search_evidence/i.test(n)));
});
