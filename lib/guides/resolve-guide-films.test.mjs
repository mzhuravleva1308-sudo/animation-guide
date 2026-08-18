import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { WEIRD_ANIMATED_MOVIES_GUIDE } from "./weird-animated-movies.mjs";
import { getCatalogGuideLink } from "./catalog-guide-links.mjs";
import { PUBLIC_GUIDE_LINKS } from "./public-guide-links.mjs";
import {
  listGuideFilmTitles,
  resolveGuideAnchorFilm,
  resolveGuideFilms,
} from "./resolve-guide-films.mjs";

describe("resolveGuideFilms", () => {
  it("keeps editorial group order and does not personalize", () => {
    const films = [
      { id: "nausicaa", title: "Nausicaä of the Valley of the Wind" },
      { id: "robot", title: "Robot Dreams" },
      { id: "away", title: "Away" },
      { id: "turtle", title: "The Red Turtle" },
      { id: "marona", title: "Marona's Fantastic Tale" },
      { id: "padak", title: "Padak" },
      { id: "birdboy", title: "Birdboy: The Forgotten Children" },
      { id: "boy", title: "Boy and the World" },
      { id: "sirocco", title: "Sirocco and the Kingdom of the Winds" },
    ];

    const resolved = resolveGuideFilms(FILMS_LIKE_FLOW_GUIDE, films);

    assert.deepEqual(resolved.missingTitles, []);
    assert.equal(resolved.groups.length, 3);
    assert.deepEqual(
      resolved.groups.map((group) => group.items.map((item) => item.film.id)),
      [
        ["robot", "away", "turtle"],
        ["marona", "padak", "birdboy"],
        ["boy", "sirocco", "nausicaa"],
      ]
    );
    assert.equal(
      resolved.groups[0].description.includes("images, movement, and silence"),
      true
    );
    assert.equal(resolved.groups[0].items[0].note, null);
  });

  it("returns no groups when any editorial title is missing", () => {
    const films = [{ id: "robot", title: "Robot Dreams" }];
    const resolved = resolveGuideFilms(FILMS_LIKE_FLOW_GUIDE, films);

    assert.deepEqual(resolved.groups, []);
    assert.equal(resolved.missingTitles.includes("Away"), true);
    assert.equal(
      resolved.missingTitles.includes("Sirocco and the Kingdom of the Winds"),
      true
    );
  });
});

describe("resolveGuideAnchorFilm", () => {
  it("matches the anchor title exactly and does not substitute", () => {
    const films = [
      { id: "flow", title: "Flow" },
      { id: "robot", title: "Robot Dreams" },
    ];

    assert.equal(resolveGuideAnchorFilm(FILMS_LIKE_FLOW_GUIDE, films)?.id, "flow");
    assert.equal(
      resolveGuideAnchorFilm(FILMS_LIKE_FLOW_GUIDE, [{ id: "robot", title: "Robot Dreams" }]),
      null
    );
  });
});

describe("films-like-flow editorial config", () => {
  it("has three groups of three unique catalog titles", () => {
    const titles = listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE);
    assert.equal(FILMS_LIKE_FLOW_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(FILMS_LIKE_FLOW_GUIDE.h1, "9 Movies Like Flow");
    assert.equal(
      FILMS_LIKE_FLOW_GUIDE.h1.includes("Beautiful Animated Films"),
      false
    );
    assert.equal(FILMS_LIKE_FLOW_GUIDE.cta.href, "/");
    assert.equal(FILMS_LIKE_FLOW_GUIDE.anchorTitle, "Flow");
    assert.equal(
      FILMS_LIKE_FLOW_GUIDE.groups.every((group) => group.description?.length > 0),
      true
    );
  });
});

describe("beautiful-animated-films editorial config", () => {
  it("has three groups of three unique catalog titles", () => {
    const titles = listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE);
    assert.equal(BEAUTIFUL_ANIMATED_FILMS_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(
      BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1,
      "Beautiful Animated Films Worth Discovering"
    );
    assert.equal(
      BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1.includes("Visually Stunning"),
      false
    );
    assert.equal(
      BEAUTIFUL_ANIMATED_FILMS_GUIDE.intro.join(" ").includes(
        "visually stunning animated movies"
      ),
      true
    );
    assert.equal(BEAUTIFUL_ANIMATED_FILMS_GUIDE.cta.href, "/");
    assert.equal(BEAUTIFUL_ANIMATED_FILMS_GUIDE.anchorTitle, undefined);
    assert.equal(
      BEAUTIFUL_ANIMATED_FILMS_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.deepEqual(
      BEAUTIFUL_ANIMATED_FILMS_GUIDE.groups.map((group) => group.heading),
      [
        "Award-winning beauty",
        "Warm, tactile beauty",
        "Quiet, atmospheric beauty",
      ]
    );
  });
});

describe("weird-animated-movies editorial config", () => {
  it("has three groups of three unique catalog titles with notes", () => {
    const titles = listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE);
    assert.equal(WEIRD_ANIMATED_MOVIES_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.h1,
      "Weird Animated Movies: Strange Films You Probably Haven’t Seen"
    );
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.intro.join(" ").includes("Weird animated movies"),
      true
    );
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.intro.join(" ").includes("strange animated movies"),
      true
    );
    assert.equal(WEIRD_ANIMATED_MOVIES_GUIDE.cta.href, "/");
    assert.equal(WEIRD_ANIMATED_MOVIES_GUIDE.anchorTitle, undefined);
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.groups.every((group) =>
        group.films.every((film) => String(film.note ?? "").trim().length > 0)
      ),
      true
    );
    assert.deepEqual(
      WEIRD_ANIMATED_MOVIES_GUIDE.groups.map((group) => group.heading),
      [
        "When the world makes no normal sense",
        "When the story runs on dream logic",
        "When everything feels slightly wrong",
      ]
    );
    assert.deepEqual(titles, [
      "Junk Head",
      "Cryptozoo",
      "Son of the White Mare",
      "Mind Game",
      "Dozens of Norths",
      "The Tune",
      "The Wolf House",
      "The Pied Piper",
      "A Town Called Panic",
    ]);
  });

  it("passes editorial notes through in catalog order", () => {
    const films = listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE).map(
      (title, index) => ({ id: `film-${index}`, title })
    );
    const resolved = resolveGuideFilms(WEIRD_ANIMATED_MOVIES_GUIDE, films);

    assert.deepEqual(resolved.missingTitles, []);
    assert.equal(
      resolved.groups[0].items[0].note.includes("homemade bodies"),
      true
    );
    assert.equal(resolved.groups[1].items[1].film.title, "Dozens of Norths");
    assert.equal(resolved.groups[2].items[2].film.title, "A Town Called Panic");
  });
});

describe("getCatalogGuideLink", () => {
  it("links the Flow catalog card to the guide and ignores other titles", () => {
    assert.deepEqual(getCatalogGuideLink("Flow"), {
      href: "/guides/films-like-flow",
      label: "9 Movies Like Flow",
    });
    assert.equal(getCatalogGuideLink("Robot Dreams"), null);
    assert.equal(getCatalogGuideLink("flow"), null);
  });

  it("links beautiful-animated-films titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("Arco"), {
      href: "/guides/beautiful-animated-films",
      label: "Beautiful animated films",
    });
    assert.deepEqual(
      getCatalogGuideLink("Little Amélie or the Character of Rain"),
      {
        href: "/guides/beautiful-animated-films",
        label: "Beautiful animated films",
      }
    );
  });

  it("links weird-animated-movies titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("Junk Head"), {
      href: "/guides/weird-animated-movies",
      label: "Weird animated movies",
    });
    assert.deepEqual(getCatalogGuideLink("A Town Called Panic"), {
      href: "/guides/weird-animated-movies",
      label: "Weird animated movies",
    });
  });
});

describe("PUBLIC_GUIDE_LINKS", () => {
  it("lists editorial guides for the guides index", () => {
    assert.deepEqual(
      PUBLIC_GUIDE_LINKS.map((guide) => guide.href),
      [
        "/guides/films-like-flow",
        "/guides/beautiful-animated-films",
        "/guides/weird-animated-movies",
      ]
    );
    assert.equal(PUBLIC_GUIDE_LINKS[0].label, "9 Movies Like Flow");
    assert.equal(PUBLIC_GUIDE_LINKS[1].label, "Beautiful animated films");
    assert.equal(PUBLIC_GUIDE_LINKS[2].label, "Weird animated movies");
    assert.equal(PUBLIC_GUIDE_LINKS[0].title, FILMS_LIKE_FLOW_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[1].title, BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[2].title, WEIRD_ANIMATED_MOVIES_GUIDE.h1);
  });
});

