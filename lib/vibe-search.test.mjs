import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMoodEmbeddingInput,
  buildVibeQueryNormalizePrompt,
  cleanNormalizedVibePhrase,
  detectSearchIntent,
  expandVibeTerms,
  rankPersonalizedVibe,
  rankVibeByMoodEmbedding,
  searchVibeFilms,
} from "./vibe-search.mjs";

test("Russian kindness+magic query is vibe, not title lookup", () => {
  assert.equal(detectSearchIntent("про добро и волшебство"), "vibe");
  assert.equal(detectSearchIntent("Persepolis"), "lookup");
});

test("expands добро/волшебство into English catalog terms", () => {
  const terms = expandVibeTerms("про добро и волшебство");
  assert.ok(terms.includes("kindness"));
  assert.ok(terms.includes("magic"));
  assert.ok(!terms.includes("про"));
  assert.ok(!terms.includes("и"));
});

test("ranks a kind-magic film above a grim one", () => {
  const films = [
    {
      id: "1",
      title: "Warm Spell",
      the_mood: "Tender and warm, with quiet wonder.",
      themes: ["kindness", "magic"],
      moods: ["tender", "warm"],
      kid_safety: "yes",
    },
    {
      id: "2",
      title: "Bleak War",
      the_mood: "Cold and brutal, with no mercy.",
      themes: ["war", "revenge"],
      moods: ["grim"],
      kid_safety: "no",
    },
  ];

  const results = searchVibeFilms(films, "про добро и волшебство", {
    limit: 5,
  });

  assert.equal(results[0].film.title, "Warm Spell");
  assert.ok(results[0].score > (results[1]?.score ?? 0));
  assert.ok(results[0].matchedTerms.includes("kindness"));
  assert.ok(results[0].matchedTerms.includes("magic"));
});

test("both kindness and magic beat warmth-only", () => {
  const films = [
    {
      id: "1",
      title: "Warm School",
      the_mood: "Warm and tender playground days.",
      themes: ["friendship"],
      moods: ["warm", "tender"],
    },
    {
      id: "2",
      title: "Kind Spell",
      the_mood: "Gentle wonder and quiet magic.",
      themes: ["kindness", "magic"],
      moods: ["tender", "wonder"],
    },
  ];

  const results = searchVibeFilms(films, "про добро и волшебство", { limit: 5 });
  assert.equal(results[0].film.title, "Kind Spell");
});

test("personal taste can outrank a more generic vibe hit", () => {
  const ranked = rankPersonalizedVibe(
    [
      { film: { id: "totoro", title: "My Neighbor Totoro" }, score: 0.6 },
      { film: { id: "arco", title: "Arco" }, score: 0.57 },
    ],
    new Map([
      ["totoro", { balanced: 0.2 }],
      ["arco", { balanced: 0.95 }],
    ]),
    { limit: 2 }
  );

  assert.equal(ranked[0].film.title, "Arco");
  assert.ok(ranked[0].combinedScore > ranked[1].combinedScore);
});

test("already rated films are excluded from personalized vibe", () => {
  const ranked = rankPersonalizedVibe(
    [{ film: { id: "1", title: "Totoro" }, score: 0.9 }],
    new Map([["1", { balanced: 1 }]]),
    { ratedFilmIds: ["1"] }
  );
  assert.deepEqual(ranked, []);
});

test("detailed care-in-hard-world query expands all three facets", () => {
  const terms = expandVibeTerms(
    "Ощущение заботы и добра в сложном мире и ощущение волшебства в обыденности"
  );
  assert.ok(terms.includes("caring") || terms.includes("care"));
  assert.ok(terms.includes("kindness"));
  assert.ok(terms.includes("harsh") || terms.includes("bittersweet"));
  assert.ok(terms.includes("everyday") || terms.includes("ordinary"));
  assert.ok(terms.includes("magic") || terms.includes("wonder"));
  assert.equal(
    detectSearchIntent(
      "Ощущение заботы и добра в сложном мире и ощущение волшебства в обыденности"
    ),
    "vibe"
  );
});

test("normalizes vibe phrases into mood-embedding input shape", () => {
  assert.equal(
    buildMoodEmbeddingInput("tender care, bittersweet quiet wonder"),
    "animated film emotional atmosphere: tender care, bittersweet quiet wonder"
  );
  assert.equal(
    cleanNormalizedVibePhrase('"warmth in a harsh world"', "fallback"),
    "warmth in a harsh world"
  );
  assert.match(buildVibeQueryNormalizePrompt("забота"), /Query: забота/);
  assert.match(buildVibeQueryNormalizePrompt("тьма"), /Preserve polarity/);
  assert.match(buildVibeQueryNormalizePrompt("мрачная муть"), /муть/);
});

test("expands мрачная муть / тьма into dark English mood terms", () => {
  const terms = expandVibeTerms("мрачная муть");
  assert.ok(terms.includes("bleak") || terms.includes("dark"));
  assert.ok(terms.includes("murky") || terms.includes("oppressive"));
  assert.equal(detectSearchIntent("мрачная муть"), "vibe");
  assert.equal(detectSearchIntent("тьма"), "vibe");
});

test("rankVibeByMoodEmbedding blends taste only among near vibe matches", () => {
  const queryEmbedding = [1, 0, 0];
  const ranked = rankVibeByMoodEmbedding({
    films: [
      { id: "a", title: "Close Mood Weak Taste" },
      { id: "b", title: "Close Mood Strong Taste" },
      { id: "c", title: "Already Rated" },
    ],
    queryEmbedding,
    moodEmbeddingByFilmId: new Map([
      ["a", [1, 0, 0]],
      // Cosine ~0.97 → still inside the 0.93 relative vibe gate.
      ["b", [0.97, Math.sqrt(1 - 0.97 ** 2), 0]],
      ["c", [1, 0, 0]],
    ]),
    personalByFilmId: new Map([
      ["a", { balanced: 0.1 }],
      ["b", { balanced: 0.95 }],
      ["c", { balanced: 1 }],
    ]),
    ratedFilmIds: ["c"],
    limit: 5,
  });

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].film.title, "Close Mood Strong Taste");
  assert.ok(!ranked.some((row) => row.film.id === "c"));
});

test("rankVibeByMoodEmbedding does not let beloved warm films beat a dark vibe", () => {
  const queryEmbedding = [1, 0, 0];
  const ranked = rankVibeByMoodEmbedding({
    films: [
      { id: "dark", title: "Bleak Match" },
      { id: "cute", title: "Beloved Cute" },
    ],
    queryEmbedding,
    moodEmbeddingByFilmId: new Map([
      ["dark", [1, 0, 0]],
      // Far below the relative vibe gate vs the best dark match.
      ["cute", [0.5, 0.5, 0]],
    ]),
    personalByFilmId: new Map([
      ["dark", { balanced: 0.2 }],
      ["cute", { balanced: 0.99 }],
    ]),
    limit: 5,
  });

  assert.equal(ranked[0].film.title, "Bleak Match");
  assert.ok(!ranked.some((row) => row.film.id === "cute"));
});

test("care in a hard world beats care-only fairy fluff", () => {
  const films = [
    {
      id: "1",
      title: "Soft Sparkle",
      the_mood: "Bright and playful magical fun.",
      themes: ["magic", "adventure"],
      moods: ["playful"],
    },
    {
      id: "2",
      title: "Quiet Shelter",
      the_mood:
        "Tender companionship against grief and a harsh cold world, with quiet everyday wonder.",
      themes: ["care", "loss", "ordinary magic"],
      moods: ["tender", "bittersweet"],
    },
  ];

  const results = searchVibeFilms(
    films,
    "Ощущение заботы и добра в сложном мире и ощущение волшебства в обыденности",
    { limit: 5 }
  );
  assert.equal(results[0].film.title, "Quiet Shelter");
});
