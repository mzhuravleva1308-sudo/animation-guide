import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { NON_DISNEY_ANIMATED_MOVIES_GUIDE } from "./non-disney-animated-movies.mjs";
import { WEIRD_ANIMATED_MOVIES_GUIDE } from "./weird-animated-movies.mjs";
import { getCatalogGuideLink } from "./catalog-guide-links.mjs";
import { PUBLIC_GUIDE_LINKS } from "./public-guide-links.mjs";
import {
  findGuideFilmByTitle,
  listGuideFilmTitles,
  resolveGuideAnchorFilm,
  resolveGuideFilms,
} from "./resolve-guide-films.mjs";

describe("resolveGuideFilms", () => {
  it("keeps editorial group order and does not personalize", () => {
    const films = [
      { id: "north", title: "Long Way North" },
      { id: "hokusai", title: "Miss Hokusai" },
      { id: "lucy", title: "Lucy Lost" },
      { id: "boat", title: "A Boat in the Garden" },
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
        ["boat", "lucy", "hokusai"],
        ["marona", "padak", "birdboy"],
        ["boy", "sirocco", "north"],
      ]
    );
    assert.equal(
      resolved.groups[0].description.includes("These films are very quiet"),
      true
    );
    assert.equal(resolved.groups[0].items[0].note, null);
  });

  it("returns no groups when any editorial title is missing", () => {
    const films = [{ id: "lucy", title: "Lucy Lost" }];
    const resolved = resolveGuideFilms(FILMS_LIKE_FLOW_GUIDE, films);

    assert.deepEqual(resolved.groups, []);
    assert.equal(resolved.missingTitles.includes("Miss Hokusai"), true);
    assert.equal(
      resolved.missingTitles.includes("Sirocco and the Kingdom of the Winds"),
      true
    );
  });
});

describe("findGuideFilmByTitle", () => {
  it("matches the exact title and does not substitute", () => {
    const films = [
      { id: "kells", title: "The Secret of Kells" },
      { id: "kaguya", title: "The Tale of the Princess Kaguya" },
    ];

    assert.equal(findGuideFilmByTitle(films, "The Secret of Kells")?.id, "kells");
    assert.equal(findGuideFilmByTitle(films, "Secret of Kells"), null);
    assert.equal(findGuideFilmByTitle(films, ""), null);
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
      FILMS_LIKE_FLOW_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/non-disney-animated-movies"
      ),
      true
    );
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
      BEAUTIFUL_ANIMATED_FILMS_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/non-disney-animated-movies"
      ),
      true
    );
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
  it("has three groups of three unique catalog titles", () => {
    const titles = listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE);
    assert.equal(WEIRD_ANIMATED_MOVIES_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.h1,
      "Weird Animated Movies: Strange Films You Probably Haven’t Seen"
    );
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.intro.join(" ").includes("weird animation"),
      true
    );
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.intro
        .join(" ")
        .includes("nine unusual animated films"),
      true
    );
    assert.equal(WEIRD_ANIMATED_MOVIES_GUIDE.cta.href, "/");
    assert.equal(WEIRD_ANIMATED_MOVIES_GUIDE.anchorTitle, undefined);
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/non-disney-animated-movies"
      ),
      true
    );
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      WEIRD_ANIMATED_MOVIES_GUIDE.groups.every((group) =>
        group.films.every((film) => !String(film.note ?? "").trim())
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
      "Nobody",
      "White Plastic Sky",
      "The Last Fiction",
      "The Storm",
      "Dozens of Norths",
      "The Tune",
      "Memory Hotel",
      "The Pied Piper",
      "Decorado",
    ]);
  });

  it("resolves films in catalog order", () => {
    const films = listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE).map(
      (title, index) => ({ id: `film-${index}`, title })
    );
    const resolved = resolveGuideFilms(WEIRD_ANIMATED_MOVIES_GUIDE, films);

    assert.deepEqual(resolved.missingTitles, []);
    assert.equal(resolved.groups[0].items[0].note, null);
    assert.equal(resolved.groups[1].items[1].film.title, "Dozens of Norths");
    assert.equal(resolved.groups[2].items[2].film.title, "Decorado");
  });
});

describe("animation-styles editorial config", () => {
  it("has unique titles unused by other published guides", () => {
    const titles = listGuideFilmTitles(ANIMATION_STYLES_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(NON_DISNEY_ANIMATED_MOVIES_GUIDE),
    ]);

    assert.equal(ANIMATION_STYLES_GUIDE.groups.length, 10);
    assert.equal(titles.length, 19);
    assert.equal(new Set(titles).size, 19);
    assert.equal(
      ANIMATION_STYLES_GUIDE.h1,
      "Animation Styles: A Visual Guide to Different Types of Animation"
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.documentTitle,
      "Animation Styles: A Visual Guide to Different Types"
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.metaDescription.includes("different animation styles"),
      true
    );
    assert.deepEqual(
      ANIMATION_STYLES_GUIDE.groups.map((group) => group.heading),
      [
        "Hand-drawn and traditional 2D animation",
        "Digital 2D",
        "3D animation",
        "Stop motion",
        "Rotoscoping",
        "Cut-out and silhouette",
        "Collage and mixed media",
        "Experimental animation",
        "Painterly — a visual style, not a technique",
        "Watercolor — a visual style, not a technique",
      ]
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.groups[1].description.includes("2D animation movies"),
      true
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.groups[8].description.includes("artistic animation"),
      true
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.groups[9].description.includes(
        "visual style rather than a separate production technique"
      ),
      true
    );
    assert.deepEqual(
      ANIMATION_STYLES_GUIDE.relatedGuides?.map((guide) => guide.href),
      [
        "/guides/beautiful-animated-films",
        "/guides/films-like-flow",
        "/guides/weird-animated-movies",
        "/guides/non-disney-animated-movies",
      ]
    );
    assert.equal(ANIMATION_STYLES_GUIDE.anchorTitle, undefined);
    assert.equal(
      ANIMATION_STYLES_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.groups.every((group) =>
        group.films.every((film) => !String(film.note ?? "").trim())
      ),
      true
    );
    assert.equal(
      titles.every((title) => !occupied.has(title)),
      true
    );
    assert.equal(
      titles.some((title) => title.includes("\u2019")),
      true
    );
  });
});

describe("non-disney-animated-movies editorial config", () => {
  it("has three groups of three unique catalog titles unused by other guides", () => {
    const titles = listGuideFilmTitles(NON_DISNEY_ANIMATED_MOVIES_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE),
    ]);

    assert.equal(NON_DISNEY_ANIMATED_MOVIES_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.h1,
      "Non-Disney Animated Movies: A World Beyond the Big Studios"
    );
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.documentTitle,
      "Non-Disney Animated Movies Beyond the Big Studios"
    );
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.intro[0].includes(
        "non-Disney animated movies"
      ),
      true
    );
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.intro
        .join(" ")
        .includes("non-Disney animated films"),
      true
    );
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.metaDescription.includes(
        "Non-Disney animated movies"
      ),
      true
    );
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.personalNote.includes(
        "non-Disney animated movies"
      ),
      true
    );
    assert.equal(NON_DISNEY_ANIMATED_MOVIES_GUIDE.cta.href, "/");
    assert.equal(NON_DISNEY_ANIMATED_MOVIES_GUIDE.anchorTitle, undefined);
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.groups.every((group) =>
        group.films.every((film) => !String(film.note ?? "").trim())
      ),
      true
    );
    assert.deepEqual(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.groups.map((group) => group.heading),
      [
        "If you wanted a sense of wonder",
        "When the film is built by hand",
        "Stories the big studios would not tell",
      ]
    );
    assert.deepEqual(titles, [
      "The Painting",
      "ChaO",
      "Pachamama",
      "Mary and Max",
      "Savages",
      "Anomalisa",
      "The Glassworker",
      "Wrinkles",
      "Sultana's Dream",
    ]);
    assert.deepEqual(
      NON_DISNEY_ANIMATED_MOVIES_GUIDE.relatedGuides?.map((guide) => guide.href),
      [
        "/guides/films-like-flow",
        "/guides/beautiful-animated-films",
        "/guides/weird-animated-movies",
        "/guides/animation-styles",
      ]
    );
    assert.equal(
      titles.every((title) => !occupied.has(title)),
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
    assert.deepEqual(getCatalogGuideLink("Nobody"), {
      href: "/guides/weird-animated-movies",
      label: "Weird animated movies",
    });
    assert.deepEqual(getCatalogGuideLink("Decorado"), {
      href: "/guides/weird-animated-movies",
      label: "Weird animated movies",
    });
  });

  it("links animation-styles titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("Endless Cookie"), {
      href: "/guides/animation-styles",
      label: "Animation styles",
    });
    assert.deepEqual(getCatalogGuideLink("Josep"), {
      href: "/guides/animation-styles",
      label: "Animation styles",
    });
    assert.deepEqual(getCatalogGuideLink("The Illusionist"), {
      href: "/guides/animation-styles",
      label: "Animation styles",
    });
  });

  it("links non-disney-animated-movies titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("The Painting"), {
      href: "/guides/non-disney-animated-movies",
      label: "Non-Disney animated movies",
    });
    assert.deepEqual(getCatalogGuideLink("Sultana's Dream"), {
      href: "/guides/non-disney-animated-movies",
      label: "Non-Disney animated movies",
    });
    assert.deepEqual(getCatalogGuideLink("Savages"), {
      href: "/guides/non-disney-animated-movies",
      label: "Non-Disney animated movies",
    });
    assert.deepEqual(getCatalogGuideLink("The Glassworker"), {
      href: "/guides/non-disney-animated-movies",
      label: "Non-Disney animated movies",
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
        "/guides/animation-styles",
        "/guides/non-disney-animated-movies",
      ]
    );
    assert.equal(PUBLIC_GUIDE_LINKS[0].label, "9 Movies Like Flow");
    assert.equal(PUBLIC_GUIDE_LINKS[1].label, "Beautiful animated films");
    assert.equal(PUBLIC_GUIDE_LINKS[2].label, "Weird animated movies");
    assert.equal(PUBLIC_GUIDE_LINKS[3].label, "Animation styles");
    assert.equal(PUBLIC_GUIDE_LINKS[4].label, "Non-Disney animated movies");
    assert.equal(PUBLIC_GUIDE_LINKS[0].title, FILMS_LIKE_FLOW_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[1].title, BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[2].title, WEIRD_ANIMATED_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[3].title, ANIMATION_STYLES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[4].title, NON_DISNEY_ANIMATED_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[0].coverTitle, "Flow");
    assert.equal(PUBLIC_GUIDE_LINKS[0].coverTitle, FILMS_LIKE_FLOW_GUIDE.anchorTitle);
    assert.equal(PUBLIC_GUIDE_LINKS[1].coverTitle, "Arco");
    assert.equal(PUBLIC_GUIDE_LINKS[2].coverTitle, "Nobody");
    assert.equal(PUBLIC_GUIDE_LINKS[3].coverTitle, "Fantastic Planet");
    assert.equal(PUBLIC_GUIDE_LINKS[4].coverTitle, "The Painting");
    assert.equal(
      listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[1].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[2].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(ANIMATION_STYLES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[3].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(NON_DISNEY_ANIMATED_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[4].coverTitle
      ),
      true
    );
  });
});

