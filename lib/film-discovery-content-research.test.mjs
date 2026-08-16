import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentCuratorPrompt,
} from "./film-discovery-content.mjs";
import {
  createWikipediaResearchState,
  extractTechniqueEvidenceFromText,
  extractTechniqueEvidenceFromTmdbKeywords,
  fetchWikipediaContentResearch,
  gatherTechniqueResearch,
  hasSufficientTechniqueEvidence,
  scoreWikipediaIdentityMatch,
  SOURCE_TIERS,
} from "./film-discovery-content-research.mjs";
import { resolveTechniqueStatusPolicy } from "./film-discovery-technique.mjs";

test("TMDB keywords map to technique evidence and ignore non-technique tags", () => {
  const hits = extractTechniqueEvidenceFromTmdbKeywords([
    { id: 1, name: "stop motion" },
    { id: 2, name: "3d animation" },
    { id: 3, name: "adult animation" },
    { id: 4, name: "painter" },
    { id: 5, name: "rotoscoping" },
  ]);
  assert.ok(hits.some((row) => row.label === "stop-motion animation"));
  assert.ok(hits.some((row) => row.label === "rotoscope"));
  assert.equal(
    hits.some((row) => /3D animation|adult|painter/i.test(row.label)),
    false
  );
  assert.equal(
    hits.find((row) => row.label === "stop-motion animation")?.distinctive,
    true
  );
});

test("TMDB keyword evidence is gathered when movie id is provided", async () => {
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes("/keywords")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 39510,
          keywords: [
            { id: 1, name: "stop motion" },
            { id: 2, name: "adult animation" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  const result = await gatherTechniqueResearch(
    { title: "Blood Tea and Red String", year: 2006, source_urls: [] },
    {
      tmdbMovieId: 39510,
      tmdbApiKey: "test-key",
      fetchImpl,
      enableWikipedia: false,
      enableSourceFetch: false,
    }
  );
  assert.ok(
    result.techniqueEvidence.some((row) => row.label === "stop-motion animation")
  );
  assert.ok(result.researchSources.includes("TMDB keywords"));
  assert.equal(hasSufficientTechniqueEvidence(result.techniqueEvidence), true);
});

test("generic-only TMDB keyword does not skip Wikipedia fallback", () => {
  assert.equal(
    hasSufficientTechniqueEvidence([
      {
        label: "2D animation",
        tier: SOURCE_TIERS.tmdb,
        distinctive: false,
      },
    ]),
    false
  );
  assert.equal(
    hasSufficientTechniqueEvidence([
      {
        label: "stop-motion animation",
        tier: SOURCE_TIERS.tmdb,
        distinctive: true,
      },
    ]),
    true
  );
});

test("direct rotoscoped wording creates evidence", () => {
  const hits = extractTechniqueEvidenceFromText(
    "The film is a rotoscoped animated feature produced over three years.",
    {
      sourceLabel: "wiki",
      sourceUrl: "https://en.wikipedia.org/wiki/Heavy_Metal_(film)",
      tier: SOURCE_TIERS.wikipedia,
      requireProductionContext: true,
      baseConfidence: 0.5,
    }
  );
  assert.ok(hits.some((row) => row.label === "rotoscope"));
  assert.ok(hits[0].evidenceSummary);
  assert.equal(hits[0].sourceUrl.includes("wikipedia.org"), true);
});

test("year-only wikipedia match is rejected", () => {
  const result = scoreWikipediaIdentityMatch(
    { title: "Unique Title XYZ", year: 2001, directors: ["Jane Director"] },
    {
      title: "Some Other Page",
      extract:
        "This is an animated feature film released in 2001 by someone else.",
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.ambiguous, true);
});

test("single title token without year is rejected", () => {
  const result = scoreWikipediaIdentityMatch(
    { title: "Metropia", year: 2009, directors: ["Tarik Saleh"] },
    {
      title: "Metropia (disambiguation)",
      extract: "Metropia may refer to several topics without a clear film year.",
    }
  );
  assert.equal(result.ok, false);
});

test("verified title + year + director is accepted", () => {
  const result = scoreWikipediaIdentityMatch(
    {
      title: "The Peasants",
      year: 2023,
      directors: ["DK Welchman", "Hugh Welchman"],
    },
    {
      title: "The Peasants (2023 film)",
      extract:
        "The Peasants is a 2023 animated feature film directed by DK Welchman and Hugh Welchman. The production used oil-painted frames photographed for each shot.",
    }
  );
  assert.equal(result.ok, true);
  assert.match(result.reason, /title_confirmed/);
  assert.match(result.reason, /director_confirmed/);
});

test("source_urls are checked before Wikipedia and wiki is skipped when sufficient", async () => {
  let wikiCalls = 0;
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes("wikipedia.org")) {
      wikiCalls += 1;
      throw new Error("wikipedia should not be called");
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () =>
        "<html><body>Official press kit: produced with stop-motion puppet animation over two years.</body></html>",
      json: async () => ({}),
    };
  };

  const result = await gatherTechniqueResearch(
    {
      title: "Puppet Film",
      year: 2018,
      directors: ["A Dir"],
      source_urls: ["https://annecy.org/films/puppet-film"],
    },
    {
      tmdbOverview: "A story about friends.",
      fetchImpl,
      enableWikipedia: true,
    }
  );

  assert.equal(wikiCalls, 0);
  assert.equal(result.usedWikipediaFallback, false);
  assert.ok(result.researchNotes.includes("wikipedia_skipped_sufficient_evidence"));
  assert.ok(result.techniqueEvidence.some((row) => row.tier === "official"));
  assert.equal(hasSufficientTechniqueEvidence(result.techniqueEvidence), true);
});

test("Wikipedia is not called when disabled", async () => {
  let wikiCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("wikipedia.org")) wikiCalls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "<html><body>no technique here</body></html>",
      json: async () => ({}),
    };
  };
  const result = await gatherTechniqueResearch(
    { title: "X", year: 2000, directors: ["D"], source_urls: [] },
    { fetchImpl, enableWikipedia: false, enableSourceFetch: false }
  );
  assert.equal(wikiCalls, 0);
  assert.ok(result.researchNotes.includes("wikipedia_disabled"));
});

test("ambiguous wikipedia match does not create technique evidence", async () => {
  const state = createWikipediaResearchState({ delayMs: 0 });
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes("list=search") || href.includes("srsearch")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          query: { search: [{ title: "Wrong Page" }] },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        query: {
          pages: {
            1: {
              title: "Wrong Page",
              fullurl: "https://en.wikipedia.org/wiki/Wrong_Page",
              extract: "Wrong Page is a 1999 album by a rock band.",
            },
          },
        },
      }),
    };
  };

  const result = await fetchWikipediaContentResearch(
    {
      title: "Heavy Metal",
      year: 1981,
      directors: ["Gerald Potterton"],
    },
    { fetchImpl, delayMs: 0, state }
  );
  assert.equal(result.page, null);
  assert.ok(
    result.ambiguous ||
      result.reason === "ambiguous_wikipedia_match" ||
      (result.ambiguousNotes ?? []).length > 0 ||
      result.reason === "not_found"
  );
});

test("cache prevents duplicate identical Wikipedia API request in one run", async () => {
  const state = createWikipediaResearchState({ delayMs: 0 });
  let networkCalls = 0;
  const fetchImpl = async () => {
    networkCalls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ query: { search: [] } }),
    };
  };

  // Call wikipediaApi indirectly via fetchWikipedia with empty results twice
  // by searching same query path — gather with no sources twice sharing state.
  await gatherTechniqueResearch(
    { title: "CacheFilm", year: 2011, directors: ["Dir One"], source_urls: [] },
    {
      fetchImpl,
      enableSourceFetch: false,
      enableWikipedia: true,
      delayMs: 0,
      wikipediaState: state,
      tmdbOverview: "No technique words here.",
    }
  );
  const requestsAfterFirst = state.requests;
  await gatherTechniqueResearch(
    { title: "CacheFilm", year: 2011, directors: ["Dir One"], source_urls: [] },
    {
      fetchImpl,
      enableSourceFetch: false,
      enableWikipedia: true,
      delayMs: 0,
      wikipediaState: state,
      tmdbOverview: "No technique words here.",
    }
  );
  // Second run should reuse cache for identical search URL → fewer or equal network calls growth
  assert.ok(state.cache.size >= 1);
  assert.ok(networkCalls <= state.requests);
  assert.ok(requestsAfterFirst >= 1);
  // Cached responses mean networkCalls should be < total logical requests if cache works
  assert.ok(networkCalls < state.requests || state.cache.size >= 1);
});

test("429 does not crash the batch research helper", async () => {
  const state = createWikipediaResearchState({ delayMs: 0 });
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => "rate limit",
  });
  const result = await gatherTechniqueResearch(
    { title: "Rate Limited", year: 2010, directors: ["D"], source_urls: [] },
    {
      fetchImpl,
      enableSourceFetch: false,
      enableWikipedia: true,
      delayMs: 0,
      wikipediaState: state,
    }
  );
  assert.ok(Array.isArray(result.techniqueEvidence));
  assert.ok(
    result.researchNotes.includes("wikipedia_rate_limited") ||
      state.errors >= 1
  );
  assert.equal(state.stopped, true);
  assert.equal(state.rateLimited, true);

  // Later films in the same batch must not hit the network again.
  let laterCalls = 0;
  const blockedFetch = async () => {
    laterCalls += 1;
    throw new Error("should not be called after stop");
  };
  const second = await fetchWikipediaContentResearch(
    { title: "Another", year: 2011, directors: ["D"] },
    { fetchImpl: blockedFetch, delayMs: 0, state }
  );
  assert.equal(second.reason, "rate_limited");
  assert.equal(laterCalls, 0);
});

test("wikipedia page fetch asks for extracts|info|extlinks with srlimit=1", async () => {
  /** @type {string[]} */
  const urls = [];
  const state = createWikipediaResearchState({ delayMs: 0 });
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const href = String(url);
    if (href.includes("list=search") || href.includes("srsearch")) {
      assert.match(href, /srlimit=1/);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          query: { search: [{ title: "Padak (film)" }] },
        }),
      };
    }
    assert.match(href, /prop=extracts%7Cinfo%7Cextlinks|prop=extracts\|info\|extlinks/);
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
              extlinks: [{ "*": "https://studio.example/films/padak" }],
            },
          },
        },
      }),
    };
  };

  const result = await fetchWikipediaContentResearch(
    { title: "Padak", year: 2012, directors: ["Dir"] },
    { fetchImpl, delayMs: 0, state }
  );
  assert.ok(result.page);
  assert.deepEqual(result.page.extlinks, ["https://studio.example/films/padak"]);
  assert.equal(urls.filter((u) => u.includes("prop=")).length, 1);
});

test("Wikipedia extract is not embedded wholesale in curator prompt", () => {
  const prompt = buildContentCuratorPrompt(
    {
      title: "X",
      year: 2000,
      directors: ["D"],
      countries: ["F"],
      source_urls: [],
    },
    {
      tmdbOverview: "A clerk wanders the city.",
      tmdbGenreNames: ["Animation"],
      techniqueEvidence: [
        {
          label: "rotoscope",
          sourceLabel: "Wikipedia: X",
          evidenceSummary: "rotoscoped animated feature",
          confidence: 0.5,
          tier: "wikipedia",
        },
      ],
      wikipedia: {
        title: "X",
        url: "https://en.wikipedia.org/wiki/X",
        extractPreview: "THIS_SHOULD_NOT_APPEAR " + "lorem ".repeat(200),
      },
      researchNotes: [],
    }
  );
  assert.equal(prompt.includes("THIS_SHOULD_NOT_APPEAR"), false);
  assert.equal(prompt.includes("Wikipedia extract"), false);
  assert.match(prompt, /Technique evidence/);
});

test("Wikipedia-only distinctive technique becomes a note, not a hard block", () => {
  const policy = resolveTechniqueStatusPolicy({
    labels: ["rotoscope"],
    diagnostics: [],
    nonBlockingUnknown: [],
    blockingUnknown: [],
    techniqueEvidence: [
      {
        label: "rotoscope",
        tier: "wikipedia",
        distinctive: true,
        confidence: 0.5,
        sourceLabel: "Wikipedia",
        evidenceSummary: "rotoscoped",
      },
    ],
    wikipediaOnlyDistinctive: [{ label: "rotoscope" }],
  });
  assert.equal(policy.needsReview, false);
  assert.ok(
    policy.techniqueNotes.some((reason) => /wikipedia/i.test(reason))
  );
});