import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { getCatalogGuideLink } from "./catalog-guide-links.mjs";
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
      { id: "mice", title: "Even Mice Belong in Heaven" },
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
        ["marona", "mice", "birdboy"],
        ["boy", "sirocco", "nausicaa"],
      ]
    );
    assert.equal(
      resolved.groups[0].description.includes("images, movement, and silence"),
      true
    );
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
    assert.equal(FILMS_LIKE_FLOW_GUIDE.h1, "9 Movies Like Flow: Beautiful Animated Films to Watch Next");
    assert.equal(FILMS_LIKE_FLOW_GUIDE.cta.href, "/");
    assert.equal(FILMS_LIKE_FLOW_GUIDE.anchorTitle, "Flow");
    assert.equal(
      FILMS_LIKE_FLOW_GUIDE.groups.every((group) => group.description?.length > 0),
      true
    );
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
});
