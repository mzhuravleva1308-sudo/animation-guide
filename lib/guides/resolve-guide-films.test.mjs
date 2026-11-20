import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADAM_ELLIOT_MOVIES_GUIDE } from "./adam-elliot-movies.mjs";
import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE } from "./best-animated-movies-for-adults.mjs";
import { BEST_STOP_MOTION_MOVIES_GUIDE } from "./best-stop-motion-movies.mjs";
import { CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE } from "./christmas-new-year-animated-films.mjs";
import { CLAY_ANIMATION_MOVIES_GUIDE } from "./clay-animation-movies.mjs";
import { FILMS_LIKE_CORALINE_GUIDE } from "./films-like-coraline.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { FILMS_LIKE_SPIRITED_AWAY_GUIDE } from "./films-like-spirited-away.mjs";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "./indie-animated-movies-beyond-studios.mjs";
import { STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE } from "./strange-festival-animated-movies.mjs";
import { TOMM_MOORE_MOVIES_GUIDE } from "./tomm-moore-movies.mjs";
import {
  getCatalogDirectorGuideLink,
  getCatalogGuideLink,
  listCatalogDirectorCreditParts,
} from "./catalog-guide-links.mjs";
import { PUBLIC_GUIDE_LINKS } from "./public-guide-links.mjs";
import {
  findGuideFilmByTitle,
  isGuideShortFilmEntry,
  listGuideFilmTitles,
  listGuideItemListTitles,
  listGuidePreviewTitles,
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
      resolved.groups.map((group) =>
        group.items.map((item) =>
          item.kind === "catalog" ? item.film.id : item.title
        )
      ),
      [
        ["boat", "lucy", "hokusai"],
        ["marona", "padak", "birdboy"],
        ["boy", "sirocco", "north"],
      ]
    );
    assert.equal(
      resolved.groups[0].description.includes("These films make space for silence"),
      true
    );
    assert.equal(
      resolved.groups[0].items[0].note,
      "The adventure begins long before anyone sets sail. Much like Flow, it finds wonder in waiting, watching, and sensing that something bigger lies ahead."
    );
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

  it("resolves short entries without catalog rows", () => {
    const guide = {
      slug: "test-shorts",
      h1: "Test",
      intro: ["Intro"],
      personalNote: "Note",
      cta: { href: "/", label: "Home" },
      groups: [
        {
          heading: "Shorts",
          description: "External shorts",
          films: [
            {
              kind: "short",
              title: "Uncle",
              year: 1996,
              runtimeLabel: "6 min",
              watchUrl: "https://www.youtube.com/watch?v=F2Q-kSyTXYE",
              note: "Student film",
            },
            { title: "Mary and Max" },
          ],
        },
      ],
    };

    const resolved = resolveGuideFilms(guide, [
      { id: "mary", title: "Mary and Max" },
    ]);

    assert.deepEqual(resolved.missingTitles, []);
    assert.equal(resolved.groups[0].items.length, 2);
    assert.equal(resolved.groups[0].items[0].kind, "short");
    assert.equal(resolved.groups[0].items[0].title, "Uncle");
    assert.equal(resolved.groups[0].items[0].watchUrl.includes("F2Q-kSyTXYE"), true);
    assert.equal(resolved.groups[0].items[0].trailerUrl, null);
    assert.equal(resolved.groups[0].items[0].country, null);
    assert.equal(resolved.groups[0].items[0].director, null);
    assert.equal(resolved.groups[0].items[1].kind, "catalog");
    assert.equal(resolved.groups[0].items[1].film.id, "mary");
  });

  it("keeps prose blocks between films without catalog lookup", () => {
    const guide = {
      slug: "test-prose",
      h1: "Test",
      intro: ["Intro"],
      personalNote: "Note",
      cta: { href: "/", label: "Home" },
      groups: [
        {
          heading: "Mixed",
          description: "Bridge copy",
          films: [
            {
              kind: "short",
              title: "Uncle",
              year: 1996,
              runtimeLabel: "6 min",
              watchUrl: "https://www.youtube.com/watch?v=F2Q-kSyTXYE",
            },
            { kind: "prose", text: "Then he made another short." },
            { title: "Mary and Max" },
          ],
        },
      ],
    };

    const resolved = resolveGuideFilms(guide, [
      { id: "mary", title: "Mary and Max" },
    ]);

    assert.deepEqual(resolved.missingTitles, []);
    assert.equal(resolved.groups[0].items.length, 3);
    assert.equal(resolved.groups[0].items[1].kind, "prose");
    assert.equal(
      resolved.groups[0].items[1].text,
      "Then he made another short."
    );
    assert.deepEqual(listGuideFilmTitles(guide), ["Mary and Max"]);
    assert.deepEqual(listGuideItemListTitles(guide), [
      "Uncle",
      "Mary and Max",
    ]);
  });

  it("resolves guidePreview poster strips without treating titles as editorial films", () => {
    const guide = {
      slug: "test-preview",
      h1: "Test",
      intro: ["Intro"],
      personalNote: "Note",
      cta: { href: "/", label: "Home" },
      groups: [
        {
          heading: "Clay teaser",
          films: [
            {
              kind: "guidePreview",
              href: "/guides/clay-animation-movies",
              label: "Clay animation movies",
              blurb: "Plasticine beyond Wallace & Gromit.",
              titles: ["$9.99", "The Apostle"],
            },
            { title: "Living Large" },
          ],
        },
      ],
    };

    const resolved = resolveGuideFilms(guide, [
      {
        id: "nine",
        title: "$9.99",
        poster_url: "https://example.test/$9.99.jpg",
      },
      {
        id: "apostle",
        title: "The Apostle",
        image_url: "https://example.test/apostle.jpg",
      },
      { id: "living", title: "Living Large" },
    ]);

    assert.deepEqual(resolved.missingTitles, []);
    assert.equal(resolved.groups[0].items[0].kind, "guidePreview");
    assert.equal(
      resolved.groups[0].items[0].href,
      "/guides/clay-animation-movies"
    );
    assert.deepEqual(resolved.groups[0].items[0].posters, [
      { title: "$9.99", posterUrl: "https://example.test/$9.99.jpg" },
      { title: "The Apostle", posterUrl: "https://example.test/apostle.jpg" },
    ]);
    assert.deepEqual(listGuideFilmTitles(guide), ["Living Large"]);
    assert.deepEqual(listGuidePreviewTitles(guide), ["$9.99", "The Apostle"]);
    assert.deepEqual(listGuideItemListTitles(guide), ["Living Large"]);
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
        (guide) => guide.href === "/guides/indie-animated-movies-beyond-studios"
      ),
      true
    );
    assert.equal(
      FILMS_LIKE_FLOW_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/films-like-coraline"
      ),
      true
    );
    assert.equal(
      FILMS_LIKE_FLOW_GUIDE.groups.every((group) => group.description?.length > 0),
      true
    );
    assert.equal(
      FILMS_LIKE_FLOW_GUIDE.groups.every((group) =>
        group.films.every(
          (entry) =>
            entry.kind === "prose" ||
            entry.kind === "short" ||
            Boolean(String(entry.note ?? "").trim())
        )
      ),
      true
    );
  });
});

describe("films-like-spirited-away editorial config", () => {
  it("has three groups of three unique catalog titles unused by other guides", () => {
    const titles = listGuideFilmTitles(FILMS_LIKE_SPIRITED_AWAY_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      FILMS_LIKE_CORALINE_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE),
      ...listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE),
      ...listGuideFilmTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE),
    ]);

    assert.equal(FILMS_LIKE_SPIRITED_AWAY_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(FILMS_LIKE_SPIRITED_AWAY_GUIDE.h1, "9 Movies Like Spirited Away");
    assert.equal(FILMS_LIKE_SPIRITED_AWAY_GUIDE.cta.href, "/");
    assert.equal(FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle, "Spirited Away");
    assert.equal(
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/films-like-flow"
      ),
      true
    );
    assert.equal(
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.groups.every((group) =>
        group.films.every(
          (entry) =>
            entry.kind === "prose" ||
            entry.kind === "short" ||
            Boolean(String(entry.note ?? "").trim())
        )
      ),
      true
    );
    assert.deepEqual(
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.groups.map((group) => group.heading),
      [
        "If you loved stepping into the unknown",
        "If you loved the spirits and their stories",
        "If you loved finding courage along the way",
      ]
    );
    assert.deepEqual(titles, [
      "Ghost Cat Anzu",
      "Big Fish & Begonia",
      "Children of the Sea",
      "Pom Poko",
      "Lu Over the Wall",
      "The Legend of Hei",
      "The Wonderland",
      "Kubo and the Two Strings",
      "Nahuel and the Magic Book",
    ]);
    assert.equal(
      occupied.has(FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle),
      false
    );
    assert.equal(
      titles.every((title) => !occupied.has(title)),
      true
    );
  });
});

describe("films-like-coraline editorial config", () => {
  it("has three groups of three unique catalog titles unused by other guides", () => {
    const titles = listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_SPIRITED_AWAY_GUIDE),
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE),
      ...listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE),
      ...listGuideFilmTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE),
    ]);

    assert.equal(FILMS_LIKE_CORALINE_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(FILMS_LIKE_CORALINE_GUIDE.h1, "9 Movies Like Coraline");
    assert.equal(
      FILMS_LIKE_CORALINE_GUIDE.h1.includes("Beautiful Animated Films"),
      false
    );
    assert.equal(FILMS_LIKE_CORALINE_GUIDE.cta.href, "/");
    assert.equal(FILMS_LIKE_CORALINE_GUIDE.anchorTitle, "Coraline");
    assert.equal(
      FILMS_LIKE_CORALINE_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/films-like-flow"
      ),
      true
    );
    assert.equal(
      FILMS_LIKE_CORALINE_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      FILMS_LIKE_CORALINE_GUIDE.groups.every((group) =>
        group.films.every(
          (entry) =>
            entry.kind === "prose" ||
            entry.kind === "short" ||
            Boolean(String(entry.note ?? "").trim())
        )
      ),
      true
    );
    assert.deepEqual(
      FILMS_LIKE_CORALINE_GUIDE.groups.map((group) => group.heading),
      [
        "If you loved the cozy, creepy atmosphere",
        "If you loved the secret worlds",
        "If you loved the whimsical dread",
      ]
    );
    assert.deepEqual(titles, [
      "Tony, Shelly and the Magic Light",
      "My Grandfather's Demons",
      "The House",
      "Paprika",
      "Phantom Boy",
      "April and the Extraordinary World",
      "Jack and the Cuckoo-Clock Heart",
      "Toys in the Attic",
      "Isle of Dogs",
    ]);
    assert.equal(occupied.has(FILMS_LIKE_CORALINE_GUIDE.anchorTitle), false);
    assert.equal(
      titles.every((title) => !occupied.has(title)),
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
        (guide) => guide.href === "/guides/indie-animated-movies-beyond-studios"
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

describe("strange-festival-animated-movies editorial config", () => {
  it("has three groups of three unique catalog titles", () => {
    const titles = listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE);
    assert.equal(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.h1,
      "Strange Festival Animated Movies"
    );
    assert.equal(
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.intro.join(" ").includes("festival"),
      true
    );
    assert.equal(
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.intro
        .join(" ")
        .includes("nine strange festival animated movies"),
      true
    );
    assert.equal(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.cta.href, "/");
    assert.equal(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.anchorTitle, undefined);
    assert.equal(
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/indie-animated-movies-beyond-studios"
      ),
      true
    );
    assert.equal(
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.groups.every((group) =>
        group.films.every((film) => !String(film.note ?? "").trim())
      ),
      true
    );
    assert.deepEqual(
      STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.groups.map((group) => group.heading),
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
      "Have a Nice Day",
    ]);
  });

  it("resolves films in catalog order", () => {
    const films = listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE).map(
      (title, index) => ({ id: `film-${index}`, title })
    );
    const resolved = resolveGuideFilms(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE, films);

    assert.deepEqual(resolved.missingTitles, []);
    assert.equal(resolved.groups[0].items[0].note, null);
    assert.equal(resolved.groups[1].items[1].film.title, "Dozens of Norths");
    assert.equal(resolved.groups[2].items[2].film.title, "Have a Nice Day");
  });
});

describe("animation-styles editorial config", () => {
  it("has unique titles unused by other published guides", () => {
    const titles = listGuideFilmTitles(ANIMATION_STYLES_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_SPIRITED_AWAY_GUIDE),
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      FILMS_LIKE_CORALINE_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE),
      ...listGuideFilmTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE),
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
        "/guides/best-stop-motion-movies",
        "/guides/clay-animation-movies",
        "/guides/films-like-spirited-away",
        "/guides/films-like-flow",
        "/guides/films-like-coraline",
        "/guides/strange-festival-animated-movies",
        "/guides/indie-animated-movies-beyond-studios",
        "/guides/adam-elliot-movies",
        "/guides/tomm-moore-movies",
      ]
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.groups[3].description.includes(
        "/guides/best-stop-motion-movies"
      ),
      true
    );
    assert.equal(
      ANIMATION_STYLES_GUIDE.groups[0].description.includes(
        "/guides/tomm-moore-movies"
      ),
      true
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

describe("indie-animated-movies-beyond-studios editorial config", () => {
  it("has three groups of three unique catalog titles unused by other guides", () => {
    const titles = listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_SPIRITED_AWAY_GUIDE),
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      FILMS_LIKE_CORALINE_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE),
      ...listGuideFilmTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE),
    ]);

    assert.equal(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
      "Indie Animated Movies Beyond the Big Studios"
    );
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.documentTitle,
      "Indie Animated Movies Beyond the Big Studios"
    );
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro[0].includes(
        "indie animated movies beyond the studios"
      ),
      true
    );
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro
        .join(" ")
        .includes("indie and festival animated films"),
      true
    );
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.metaDescription.includes(
        "Indie animated movies beyond the big studios"
      ),
      true
    );
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.personalNote.includes(
        "indie animated movies beyond the big studios"
      ),
      true
    );
    assert.equal(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.cta.href, "/");
    assert.equal(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.anchorTitle, undefined);
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.groups.every((group) =>
        group.films.every((film) => !String(film.note ?? "").trim())
      ),
      true
    );
    assert.deepEqual(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.groups.map((group) => group.heading),
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
      "A Town Called Panic",
      "Savages",
      "Anomalisa",
      "The Glassworker",
      "Wrinkles",
      "Sultana's Dream",
    ]);
    assert.deepEqual(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.relatedGuides?.map((guide) => guide.href),
      [
        "/guides/films-like-spirited-away",
        "/guides/films-like-flow",
        "/guides/films-like-coraline",
        "/guides/beautiful-animated-films",
        "/guides/strange-festival-animated-movies",
        "/guides/animation-styles",
        "/guides/adam-elliot-movies",
        "/guides/tomm-moore-movies",
      ]
    );
    assert.equal(
      titles.every((title) => !occupied.has(title)),
      true
    );
  });
});

describe("getCatalogGuideLink", () => {
  it("links Flow and its guide films to the Flow guide", () => {
    assert.deepEqual(getCatalogGuideLink("Flow"), {
      href: "/guides/films-like-flow",
      label: "9 Movies Like Flow",
    });
    assert.deepEqual(getCatalogGuideLink("Padak"), {
      href: "/guides/films-like-flow",
      label: "9 Movies Like Flow",
    });
    assert.deepEqual(getCatalogGuideLink("A Boat in the Garden"), {
      href: "/guides/films-like-flow",
      label: "9 Movies Like Flow",
    });
    assert.equal(getCatalogGuideLink("Totally Unknown Film Title"), null);
    assert.equal(getCatalogGuideLink("flow"), null);
  });

  it("links Coraline and its guide films to the Coraline guide", () => {
    assert.deepEqual(getCatalogGuideLink("Coraline"), {
      href: "/guides/films-like-coraline",
      label: "9 Movies Like Coraline",
    });
    assert.deepEqual(getCatalogGuideLink("Paprika"), {
      href: "/guides/films-like-coraline",
      label: "9 Movies Like Coraline",
    });
    assert.deepEqual(getCatalogGuideLink("Tony, Shelly and the Magic Light"), {
      href: "/guides/films-like-coraline",
      label: "9 Movies Like Coraline",
    });
    assert.equal(getCatalogGuideLink("coraline"), null);
    assert.equal(getCatalogGuideLink("Alice"), null);
  });

  it("links Spirited Away and its guide films to the Spirited Away guide", () => {
    assert.deepEqual(getCatalogGuideLink("Spirited Away"), {
      href: "/guides/films-like-spirited-away",
      label: "9 Movies Like Spirited Away",
    });
    assert.deepEqual(getCatalogGuideLink("Ghost Cat Anzu"), {
      href: "/guides/films-like-spirited-away",
      label: "9 Movies Like Spirited Away",
    });
    assert.deepEqual(getCatalogGuideLink("The Wonderland"), {
      href: "/guides/films-like-spirited-away",
      label: "9 Movies Like Spirited Away",
    });
    assert.equal(getCatalogGuideLink("spirited away"), null);
    assert.equal(getCatalogGuideLink("Howl's Moving Castle"), null);
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

  it("links strange-festival-animated-movies titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("Nobody"), {
      href: "/guides/strange-festival-animated-movies",
      label: "Strange festival animated movies",
    });
    assert.deepEqual(getCatalogGuideLink("Have a Nice Day"), {
      href: "/guides/strange-festival-animated-movies",
      label: "Strange festival animated movies",
    });
  });

  it("links best-animated-movies-for-adults titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("Mars Express"), {
      href: "/guides/best-animated-movies-for-adults",
      label: "Best animated movies for adults",
    });
    assert.deepEqual(getCatalogGuideLink("Funan"), {
      href: "/guides/best-animated-movies-for-adults",
      label: "Best animated movies for adults",
    });
    assert.deepEqual(
      getCatalogGuideLink("Night Is Short, Walk On Girl"),
      {
        href: "/guides/best-animated-movies-for-adults",
        label: "Best animated movies for adults",
      }
    );
  });

  it("links best-stop-motion-movies titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("Mad God"), {
      href: "/guides/best-stop-motion-movies",
      label: "Best stop motion movies",
    });
    assert.deepEqual(getCatalogGuideLink("Junk Head"), {
      href: "/guides/best-stop-motion-movies",
      label: "Best stop motion movies",
    });
    assert.deepEqual(getCatalogGuideLink("Fantastic Mr. Fox"), {
      href: "/guides/best-stop-motion-movies",
      label: "Best stop motion movies",
    });
    assert.deepEqual(getCatalogGuideLink("$9.99"), {
      href: "/guides/best-stop-motion-movies",
      label: "Best stop motion movies",
    });
    assert.deepEqual(
      getCatalogGuideLink("Olivia and the Invisible Earthquake"),
      {
        href: "/guides/best-stop-motion-movies",
        label: "Best stop motion movies",
      }
    );
    // Shared with other guides for now — those guides keep the catalog chip.
    assert.deepEqual(getCatalogGuideLink("Anomalisa"), {
      href: "/guides/indie-animated-movies-beyond-studios",
      label: "Indie animated movies beyond the studios",
    });
    assert.deepEqual(getCatalogGuideLink("The House"), {
      href: "/guides/films-like-coraline",
      label: "9 Movies Like Coraline",
    });
  });

  it("links clay-animation-movies titles to that guide (except Adam Elliot filmography)", () => {
    assert.deepEqual(getCatalogGuideLink("Jasmine"), {
      href: "/guides/clay-animation-movies",
      label: "Clay animation movies",
    });
    assert.deepEqual(getCatalogGuideLink("The Adventures of Mark Twain"), {
      href: "/guides/clay-animation-movies",
      label: "Clay animation movies",
    });
    assert.deepEqual(getCatalogGuideLink("Pos eso"), {
      href: "/guides/clay-animation-movies",
      label: "Clay animation movies",
    });
    assert.deepEqual(getCatalogGuideLink("Bob Spit: We Do Not Like People"), {
      href: "/guides/clay-animation-movies",
      label: "Clay animation movies",
    });
  });

  it("does not use an Adam Elliot in-guide chip; Annecy still links Memoir", () => {
    assert.equal(getCatalogGuideLink("Mary and Max"), null);
    assert.deepEqual(getCatalogGuideLink("Memoir of a Snail"), {
      href: "/festivals/2024/annecy",
      label: "Annecy Festival Winners 2024",
    });
  });

  it("links Adam Elliot director name to the Adam Elliot guide", () => {
    assert.deepEqual(getCatalogDirectorGuideLink("Adam Elliot"), {
      href: "/guides/adam-elliot-movies",
      label: "Adam Elliot movies",
    });
    assert.equal(getCatalogDirectorGuideLink("adam elliot"), null);
    assert.equal(getCatalogDirectorGuideLink("Someone Else"), null);
  });

  it("links only the Tomm Moore name inside co-director credits", () => {
    assert.deepEqual(getCatalogDirectorGuideLink("Tomm Moore"), {
      href: "/guides/tomm-moore-movies",
      label: "Tomm Moore movies",
    });
    assert.equal(getCatalogDirectorGuideLink("Tomm Moore, Nora Twomey"), null);
    assert.equal(getCatalogDirectorGuideLink("Tomm Moore, Ross Stewart"), null);
    assert.equal(getCatalogDirectorGuideLink("Nora Twomey"), null);
    assert.equal(getCatalogDirectorGuideLink("tomm moore"), null);
    assert.deepEqual(
      listCatalogDirectorCreditParts("Tomm Moore, Nora Twomey"),
      [
        {
          name: "Tomm Moore",
          href: "/guides/tomm-moore-movies",
          label: "Tomm Moore movies",
        },
        { name: "Nora Twomey", href: null, label: null },
      ]
    );
    assert.deepEqual(
      listCatalogDirectorCreditParts("Tomm Moore, Ross Stewart"),
      [
        {
          name: "Tomm Moore",
          href: "/guides/tomm-moore-movies",
          label: "Tomm Moore movies",
        },
        { name: "Ross Stewart", href: null, label: null },
      ]
    );
    assert.deepEqual(
      listCatalogDirectorCreditParts(
        "Tomm Moore, Nora Twomey",
        "/guides/tomm-moore-movies"
      ),
      [
        { name: "Tomm Moore", href: null, label: null },
        { name: "Nora Twomey", href: null, label: null },
      ]
    );
  });

  it("does not use a Tomm Moore in-guide chip for trilogy titles", () => {
    assert.equal(getCatalogGuideLink("The Secret of Kells"), null);
    assert.equal(getCatalogGuideLink("Song of the Sea"), null);
    assert.equal(getCatalogGuideLink("Wolfwalkers"), null);
  });

  it("links Tomm Moore key-role features to the Tomm Moore guide", () => {
    assert.deepEqual(getCatalogGuideLink("The Prophet"), {
      href: "/guides/tomm-moore-movies",
      label: "Tomm Moore movies",
    });
    assert.deepEqual(getCatalogGuideLink("The Breadwinner"), {
      href: "/guides/tomm-moore-movies",
      label: "Tomm Moore movies",
    });
    assert.deepEqual(getCatalogGuideLink("My Father's Dragon"), {
      href: "/guides/tomm-moore-movies",
      label: "Tomm Moore movies",
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
    assert.deepEqual(getCatalogGuideLink("Oink"), {
      href: "/guides/animation-styles",
      label: "Animation styles",
    });
  });

  it("links indie-animated-movies-beyond-studios titles to that guide", () => {
    assert.deepEqual(getCatalogGuideLink("The Painting"), {
      href: "/guides/indie-animated-movies-beyond-studios",
      label: "Indie animated movies beyond the studios",
    });
    assert.deepEqual(getCatalogGuideLink("Sultana's Dream"), {
      href: "/guides/indie-animated-movies-beyond-studios",
      label: "Indie animated movies beyond the studios",
    });
    assert.deepEqual(getCatalogGuideLink("Savages"), {
      href: "/guides/indie-animated-movies-beyond-studios",
      label: "Indie animated movies beyond the studios",
    });
    assert.deepEqual(getCatalogGuideLink("The Glassworker"), {
      href: "/guides/indie-animated-movies-beyond-studios",
      label: "Indie animated movies beyond the studios",
    });
    assert.deepEqual(getCatalogGuideLink("A Town Called Panic"), {
      href: "/guides/indie-animated-movies-beyond-studios",
      label: "Indie animated movies beyond the studios",
    });
    // Covered by director-name link — no thematic "in …" chip.
    assert.equal(getCatalogGuideLink("Mary and Max"), null);
  });

  it("links Annecy 2026 feature winners to the festival awards page", () => {
    assert.deepEqual(getCatalogGuideLink("The Violinist"), {
      href: "/festivals/2026/annecy",
      label: "Annecy Festival Winners 2026",
    });
    assert.deepEqual(getCatalogGuideLink("Blaise"), {
      href: "/festivals/2026/annecy",
      label: "Annecy Festival Winners 2026",
    });
    assert.deepEqual(getCatalogGuideLink("Iron Boy"), {
      href: "/festivals/2026/annecy",
      label: "Annecy Festival Winners 2026",
    });
  });

  it("links Ottawa 2026 feature winners to the festival awards page", () => {
    assert.deepEqual(getCatalogGuideLink("We Are Aliens"), {
      href: "/festivals/2026/ottawa",
      label: "Ottawa Festival Winners 2026",
    });
    assert.deepEqual(getCatalogGuideLink("Magic Atlas"), {
      href: "/festivals/2026/ottawa",
      label: "Ottawa Festival Winners 2026",
    });
    assert.deepEqual(getCatalogGuideLink("Tangles"), {
      href: "/festivals/2026/ottawa",
      label: "Ottawa Festival Winners 2026",
    });
  });

  it("links Animafest Zagreb 2026 feature winners to the festival awards page", () => {
    assert.deepEqual(getCatalogGuideLink("Death Does Not Exist"), {
      href: "/festivals/2026/zagreb",
      label: "Animafest Zagreb Winners 2026",
    });
    assert.deepEqual(getCatalogGuideLink("Son of a Bitch"), {
      href: "/festivals/2026/zagreb",
      label: "Animafest Zagreb Winners 2026",
    });
    assert.deepEqual(getCatalogGuideLink("Samurai Ballerina"), {
      href: "/festivals/2026/zagreb",
      label: "Animafest Zagreb Winners 2026",
    });
  });

  it("links Stuttgart 2026 AniMovie winners to the festival awards page", () => {
    assert.deepEqual(getCatalogGuideLink("A Story About Fire"), {
      href: "/festivals/2026/stuttgart",
      label: "Stuttgart Festival Winners 2026",
    });
    assert.deepEqual(getCatalogGuideLink("Allah Is Not Obliged"), {
      href: "/festivals/2026/stuttgart",
      label: "Stuttgart Festival Winners 2026",
    });
    // Little Amélie already links to beautiful-animated-films (first match wins).
  });
});

describe("adam-elliot-movies editorial config", () => {
  it("keeps catalog features and external shorts separate", () => {
    const catalogTitles = listGuideFilmTitles(ADAM_ELLIOT_MOVIES_GUIDE);
    const allTitles = listGuideItemListTitles(ADAM_ELLIOT_MOVIES_GUIDE);
    const shortEntries = ADAM_ELLIOT_MOVIES_GUIDE.groups.flatMap((group) =>
      group.films.filter((entry) => isGuideShortFilmEntry(entry))
    );

    assert.deepEqual(catalogTitles, ["Mary and Max", "Memoir of a Snail"]);
    assert.equal(shortEntries.length, 5);
    assert.equal(allTitles.length, 7);
    assert.equal(new Set(allTitles).size, 7);
    assert.equal(ADAM_ELLIOT_MOVIES_GUIDE.slug, "adam-elliot-movies");
    assert.equal(ADAM_ELLIOT_MOVIES_GUIDE.h1, "Adam Elliot Movies");
    assert.equal(
      ADAM_ELLIOT_MOVIES_GUIDE.documentTitle,
      "Adam Elliot Movies: All 7 Films"
    );
    assert.equal(
      ADAM_ELLIOT_MOVIES_GUIDE.portrait?.src,
      "/guides/adam-elliot-movies/adam-elliot.jpg"
    );
    assert.equal(ADAM_ELLIOT_MOVIES_GUIDE.portrait?.alt, "Adam Elliot");
    assert.equal(
      ADAM_ELLIOT_MOVIES_GUIDE.metaDescription,
      "Explore all seven films by Adam Elliot, from Uncle to Memoir of a Snail. Discover the real stories behind his clay animation and watch his early shorts."
    );
    assert.equal(
      ADAM_ELLIOT_MOVIES_GUIDE.intro[0].toLowerCase().includes("adam elliot"),
      true
    );
    assert.equal(ADAM_ELLIOT_MOVIES_GUIDE.cta.href, "/");
    assert.equal(
      ADAM_ELLIOT_MOVIES_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/tomm-moore-movies"
      ),
      true
    );
    assert.equal(
      shortEntries.every(
        (entry) =>
          entry.kind === "short" &&
          String(entry.watchUrl).startsWith("https://www.youtube.com/watch?v=") &&
          String(entry.posterUrl).startsWith("/guides/adam-elliot-movies/")
      ),
      true
    );
    assert.deepEqual(
      shortEntries.map((entry) => entry.title),
      ["Uncle", "Cousin", "Brother", "Harvie Krumpet", "Ernie Biscuit"]
    );
    assert.deepEqual(
      shortEntries.map((entry) => entry.watchUrl),
      [
        "https://www.youtube.com/watch?v=F2Q-kSyTXYE",
        "https://www.youtube.com/watch?v=1zF6soE9BKU",
        "https://www.youtube.com/watch?v=UmjuMMiy6Xk",
        "https://www.youtube.com/watch?v=wrAevS1Qcaw",
        "https://www.youtube.com/watch?v=DIQe4tNan0U",
      ]
    );
  });
});

describe("tomm-moore-movies editorial config", () => {
  it("keeps catalog features and external shorts separate", () => {
    const catalogTitles = listGuideFilmTitles(TOMM_MOORE_MOVIES_GUIDE);
    const allTitles = listGuideItemListTitles(TOMM_MOORE_MOVIES_GUIDE);
    const shortEntries = TOMM_MOORE_MOVIES_GUIDE.groups.flatMap((group) =>
      group.films.filter((entry) => isGuideShortFilmEntry(entry))
    );

    assert.deepEqual(catalogTitles, [
      "The Secret of Kells",
      "Song of the Sea",
      "Wolfwalkers",
      "The Prophet",
      "The Breadwinner",
      "My Father's Dragon",
    ]);
    assert.equal(shortEntries.length, 2);
    assert.equal(allTitles.length, 8);
    assert.equal(new Set(allTitles).size, 8);
    assert.equal(TOMM_MOORE_MOVIES_GUIDE.slug, "tomm-moore-movies");
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.h1,
      "Tomm Moore Movies: A Guide to His Animated Films"
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.documentTitle,
      "Tomm Moore Movies: A Guide to His Animated Films"
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.portrait?.src,
      "/guides/tomm-moore-movies/tomm-moore.jpg"
    );
    assert.equal(TOMM_MOORE_MOVIES_GUIDE.portrait?.alt, "Tomm Moore");
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.metaDescription.includes("Wolfwalkers"),
      true
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.intro[0].toLowerCase().includes("tomm moore"),
      true
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.intro[0].includes("illuminated manuscripts"),
      true
    );
    assert.equal(TOMM_MOORE_MOVIES_GUIDE.cta.href, "/");
    assert.deepEqual(
      TOMM_MOORE_MOVIES_GUIDE.groups.map((group) => group.heading),
      [
        "Tomm Moore's Feature Films: The Irish Folklore Trilogy",
        "Early Shorts and Other Short Films",
        "Other Animated Features He Helped Create",
        "What's Next for Tomm Moore?",
      ]
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.groups[0].films.some(
        (entry) =>
          entry.title === "Song of the Sea" &&
          String(entry.note ?? "").includes("selkies")
      ),
      true
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.groups.some((group) =>
        String(group.description ?? "").includes("Kindred Spirits")
      ),
      true
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.groups[2].description.includes(
        "collaborated with other directors"
      ),
      true
    );
    assert.deepEqual(
      shortEntries.map((entry) => entry.title),
      ["Couch Potato", "There's a Monster in My Kitchen"]
    );
    assert.deepEqual(
      shortEntries.map((entry) => entry.watchUrl),
      [
        "https://shorts.screenireland.ie/films/couch-potato",
        "https://www.youtube.com/watch?v=prg24EWHNJg",
      ]
    );
    assert.equal(
      shortEntries.every(
        (entry) =>
          entry.kind === "short" &&
          String(entry.posterUrl).startsWith("/guides/tomm-moore-movies/")
      ),
      true
    );
    assert.equal(
      TOMM_MOORE_MOVIES_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/adam-elliot-movies"
      ),
      true
    );
  });
});

describe("best-animated-movies-for-adults editorial config", () => {
  it("has three groups of three unique catalog titles unused by other guides", () => {
    const titles = listGuideFilmTitles(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_SPIRITED_AWAY_GUIDE),
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      FILMS_LIKE_CORALINE_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE),
      ...listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE),
      ...listGuideFilmTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(ADAM_ELLIOT_MOVIES_GUIDE),
      ...listGuideFilmTitles(TOMM_MOORE_MOVIES_GUIDE),
    ]);

    assert.equal(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.groups.length, 3);
    assert.equal(titles.length, 9);
    assert.equal(new Set(titles).size, 9);
    assert.equal(
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.h1,
      "Best Animated Movies for Adults"
    );
    assert.equal(
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.documentTitle,
      "Best Animated Movies for Adults — Not Family Films"
    );
    assert.equal(
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.intro
        .join(" ")
        .includes("family"),
      true
    );
    assert.equal(
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.metaDescription.includes(
        "Best animated movies for adults"
      ),
      true
    );
    assert.equal(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.cta.href, "/");
    assert.equal(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.anchorTitle, undefined);
    assert.equal(
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.groups.every(
        (group) => group.description?.length > 0
      ),
      true
    );
    assert.equal(
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.groups.every((group) =>
        group.films.every((film) => String(film.note ?? "").trim().length > 0)
      ),
      true
    );
    assert.deepEqual(
      BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.groups.map((group) => group.heading),
      [
        "When animation bears witness",
        "Adult genres, no training wheels",
        "Grown-up lives and obsessions",
      ]
    );
    assert.deepEqual(titles, [
      "Funan",
      "Another Day of Life",
      "Buñuel in the Labyrinth of the Turtles",
      "Mars Express",
      "Felidae",
      "Unicorn Wars",
      "The Summit of the Gods",
      "The Rabbi's Cat",
      "Night Is Short, Walk On Girl",
    ]);
    assert.equal(
      titles.every((title) => !occupied.has(title)),
      true
    );
  });
});

describe("clay-animation-movies editorial config", () => {
  it("keeps catalog features and external shorts separate", () => {
    const catalogTitles = listGuideFilmTitles(CLAY_ANIMATION_MOVIES_GUIDE);
    const allTitles = listGuideItemListTitles(CLAY_ANIMATION_MOVIES_GUIDE);
    const shortEntries = CLAY_ANIMATION_MOVIES_GUIDE.groups.flatMap((group) =>
      group.films.filter((entry) => isGuideShortFilmEntry(entry))
    );

    assert.deepEqual(catalogTitles, [
      "Mary and Max",
      "Memoir of a Snail",
      "Jasmine",
      "The Adventures of Mark Twain",
      "Pos eso",
      "Bob Spit: We Do Not Like People",
    ]);
    assert.equal(shortEntries.length, 5);
    assert.equal(allTitles.length, 11);
    assert.equal(new Set(allTitles).size, 11);
    assert.equal(CLAY_ANIMATION_MOVIES_GUIDE.slug, "clay-animation-movies");
    assert.equal(CLAY_ANIMATION_MOVIES_GUIDE.h1, "Clay Animation Movies");
    assert.equal(
      CLAY_ANIMATION_MOVIES_GUIDE.documentTitle,
      "Clay Animation Movies Beyond Wallace & Gromit"
    );
    assert.equal(
      CLAY_ANIMATION_MOVIES_GUIDE.metaDescription
        .toLowerCase()
        .includes("clay animation"),
      true
    );
    assert.equal(
      CLAY_ANIMATION_MOVIES_GUIDE.intro[0].toLowerCase().includes("clay"),
      true
    );
    assert.equal(CLAY_ANIMATION_MOVIES_GUIDE.cta.href, "/");
    assert.deepEqual(
      CLAY_ANIMATION_MOVIES_GUIDE.groups.map((group) => group.heading),
      [
        "Clay that feels human",
        "Clay that turns strange",
        "Short clay that left fingerprints",
      ]
    );
    assert.deepEqual(
      shortEntries.map((entry) => entry.title),
      [
        "Creature Comforts",
        "Jam Session",
        "Tokri (The Basket)",
        "Sexy Laundry",
        "Joko",
      ]
    );
    assert.equal(
      shortEntries.every(
        (entry) =>
          entry.kind === "short" &&
          String(entry.posterUrl).startsWith("/guides/clay-animation-movies/")
      ),
      true
    );
    assert.equal(
      CLAY_ANIMATION_MOVIES_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/adam-elliot-movies"
      ),
      true
    );
    assert.equal(
      CLAY_ANIMATION_MOVIES_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/best-stop-motion-movies"
      ),
      true
    );
    assert.equal(
      CLAY_ANIMATION_MOVIES_GUIDE.groups.every((group) =>
        group.films.every((film) => {
          if (film.kind === "prose") return true;
          return String(film.note ?? "").trim().length > 0;
        })
      ),
      true
    );
  });
});

describe("best-stop-motion-movies editorial config", () => {
  it("has thirteen catalog titles, free shorts, and a clay guide link in intro", () => {
    const titles = listGuideFilmTitles(BEST_STOP_MOTION_MOVIES_GUIDE);

    assert.equal(BEST_STOP_MOTION_MOVIES_GUIDE.slug, "best-stop-motion-movies");
    assert.equal(BEST_STOP_MOTION_MOVIES_GUIDE.h1, "Best Stop Motion Movies");
    assert.equal(
      BEST_STOP_MOTION_MOVIES_GUIDE.documentTitle,
      "Best Stop Motion Movies Beyond the Usual Puppets"
    );
    assert.equal(
      BEST_STOP_MOTION_MOVIES_GUIDE.metaDescription
        .toLowerCase()
        .includes("stop motion"),
      true
    );
    assert.equal(
      BEST_STOP_MOTION_MOVIES_GUIDE.intro[0].toLowerCase().includes("stop motion"),
      true
    );
    assert.equal(
      BEST_STOP_MOTION_MOVIES_GUIDE.intro.some((paragraph) =>
        paragraph.includes("[clay animation movies](/guides/clay-animation-movies)")
      ),
      true
    );
    assert.equal(BEST_STOP_MOTION_MOVIES_GUIDE.cta.href, "/");
    assert.equal(BEST_STOP_MOTION_MOVIES_GUIDE.anchorTitle, undefined);
    assert.deepEqual(
      BEST_STOP_MOTION_MOVIES_GUIDE.groups.map((group) => group.heading),
      [
        "Warm and playful",
        "Bittersweet and human",
        "Strange and uneasy",
        "Dark and disturbing",
        "Free shorts worth a night in",
      ]
    );
    assert.deepEqual(titles, [
      "Fantastic Mr. Fox",
      "Living Large",
      "Olivia and the Invisible Earthquake",
      "$9.99",
      "No Dogs or Italians Allowed",
      "The Tower",
      "Sanatorium Under the Sign of the Hourglass",
      "Anomalisa",
      "This Magnificent Cake!",
      "The Wolf House",
      "Mad God",
      "Junk Head",
      "Little Otik",
    ]);
    assert.deepEqual(listGuidePreviewTitles(BEST_STOP_MOTION_MOVIES_GUIDE), []);
    assert.equal(listGuideItemListTitles(BEST_STOP_MOTION_MOVIES_GUIDE).length, 19);
    const shortTitles = BEST_STOP_MOTION_MOVIES_GUIDE.groups
      .flatMap((group) => group.films)
      .filter((film) => film.kind === "short")
      .map((film) => film.title);
    assert.deepEqual(shortTitles, [
      "Madame Tutli-Putli",
      "The Maker",
      "The Fabric of You",
      "Tulip",
      "Wander to Wonder",
      "The Girl Who Cried Pearls",
    ]);
    assert.equal(
      BEST_STOP_MOTION_MOVIES_GUIDE.groups
        .flatMap((group) => group.films)
        .filter((film) => film.kind === "short")
        .every(
          (film) =>
            String(film.watchUrl ?? "").startsWith("http") &&
            String(film.posterUrl ?? "").startsWith("/guides/best-stop-motion-movies/")
        ),
      true
    );
    assert.equal(
      BEST_STOP_MOTION_MOVIES_GUIDE.relatedGuides?.some(
        (guide) => guide.href === "/guides/clay-animation-movies"
      ),
      true
    );
    assert.equal(
      BEST_STOP_MOTION_MOVIES_GUIDE.groups.every((group) =>
        group.films.every((film) => {
          if (film.kind === "prose" || film.kind === "guidePreview") return true;
          return String(film.note ?? "").trim().length > 0;
        })
      ),
      true
    );
    // Uniqueness across guides temporarily waived — shared titles will be
    // freed from indie / styles / beautiful / Coraline in a follow-up.
  });
});

describe("PUBLIC_GUIDE_LINKS", () => {
  it("lists editorial guides newest-first by publishedAt", () => {
    assert.deepEqual(
      PUBLIC_GUIDE_LINKS.map((guide) => guide.href),
      [
        "/guides/best-stop-motion-movies",
        "/guides/clay-animation-movies",
        "/guides/best-animated-movies-for-adults",
        "/guides/tomm-moore-movies",
        "/guides/christmas-new-year-animated-films",
        "/guides/films-like-spirited-away",
        "/guides/adam-elliot-movies",
        "/guides/films-like-coraline",
        "/guides/indie-animated-movies-beyond-studios",
        "/guides/animation-styles",
        "/guides/strange-festival-animated-movies",
        "/guides/beautiful-animated-films",
        "/guides/films-like-flow",
      ]
    );
    assert.deepEqual(
      PUBLIC_GUIDE_LINKS.map((guide) => guide.publishedAt),
      [
        "2026-11-18",
        "2026-11-18",
        "2026-11-18",
        "2026-11-18",
        "2026-11-17",
        "2026-11-15",
        "2026-11-07",
        "2026-11-05",
        "2026-08-21",
        "2026-08-20",
        "2026-08-18",
        "2026-08-18",
        "2026-08-17",
      ]
    );
    assert.deepEqual(
      PUBLIC_GUIDE_LINKS.map((guide) => guide.updatedAt),
      [
        "2026-11-18",
        "2026-11-18",
        "2026-11-18",
        "2026-11-20",
        "2026-11-17",
        "2026-11-15",
        "2026-11-07",
        "2026-11-11",
        "2026-11-18",
        "2026-11-18",
        "2026-11-05",
        "2026-11-05",
        "2026-11-11",
      ]
    );
    for (let i = 1; i < PUBLIC_GUIDE_LINKS.length; i += 1) {
      assert.equal(
        PUBLIC_GUIDE_LINKS[i - 1].publishedAt >= PUBLIC_GUIDE_LINKS[i].publishedAt,
        true
      );
    }
    assert.equal(PUBLIC_GUIDE_LINKS[0].label, "Best stop motion movies");
    assert.equal(PUBLIC_GUIDE_LINKS[1].label, "Clay animation movies");
    assert.equal(PUBLIC_GUIDE_LINKS[2].label, "Best animated movies for adults");
    assert.equal(PUBLIC_GUIDE_LINKS[3].label, "Tomm Moore movies");
    assert.equal(
      PUBLIC_GUIDE_LINKS[4].label,
      "Winter Magic: Animated Films for Grown-Ups"
    );
    assert.equal(PUBLIC_GUIDE_LINKS[5].label, "9 Movies Like Spirited Away");
    assert.equal(PUBLIC_GUIDE_LINKS[6].label, "Adam Elliot movies");
    assert.equal(PUBLIC_GUIDE_LINKS[7].label, "9 Movies Like Coraline");
    assert.equal(PUBLIC_GUIDE_LINKS[8].label, "Indie animated movies beyond the studios");
    assert.equal(PUBLIC_GUIDE_LINKS[9].label, "Animation styles");
    assert.equal(PUBLIC_GUIDE_LINKS[10].label, "Strange festival animated movies");
    assert.equal(PUBLIC_GUIDE_LINKS[11].label, "Beautiful animated films");
    assert.equal(PUBLIC_GUIDE_LINKS[12].label, "9 Movies Like Flow");
    assert.equal(PUBLIC_GUIDE_LINKS[0].title, BEST_STOP_MOTION_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[1].title, CLAY_ANIMATION_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[2].title, BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[3].title, TOMM_MOORE_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[4].title, CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[5].title, FILMS_LIKE_SPIRITED_AWAY_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[6].title, ADAM_ELLIOT_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[7].title, FILMS_LIKE_CORALINE_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[8].title, INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[9].title, ANIMATION_STYLES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[10].title, STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[11].title, BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[12].title, FILMS_LIKE_FLOW_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[0].coverTitle, "No Dogs or Italians Allowed");
    assert.equal(PUBLIC_GUIDE_LINKS[1].coverTitle, "Creature Comforts");
    assert.equal(PUBLIC_GUIDE_LINKS[2].coverTitle, "Mars Express");
    assert.equal(PUBLIC_GUIDE_LINKS[3].coverTitle, "Wolfwalkers");
    assert.equal(PUBLIC_GUIDE_LINKS[4].coverTitle, "Tony, Shelly and the Magic Light");
    assert.equal(PUBLIC_GUIDE_LINKS[5].coverTitle, "Spirited Away");
    assert.equal(
      PUBLIC_GUIDE_LINKS[5].coverTitle,
      FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle
    );
    assert.equal(PUBLIC_GUIDE_LINKS[6].coverTitle, "Mary and Max");
    assert.equal(PUBLIC_GUIDE_LINKS[7].coverTitle, "Coraline");
    assert.equal(PUBLIC_GUIDE_LINKS[7].coverTitle, FILMS_LIKE_CORALINE_GUIDE.anchorTitle);
    assert.equal(PUBLIC_GUIDE_LINKS[8].coverTitle, "The Painting");
    assert.equal(PUBLIC_GUIDE_LINKS[9].coverTitle, "Fantastic Planet");
    assert.equal(PUBLIC_GUIDE_LINKS[10].coverTitle, "Nobody");
    assert.equal(PUBLIC_GUIDE_LINKS[11].coverTitle, "Arco");
    assert.equal(PUBLIC_GUIDE_LINKS[12].coverTitle, "Flow");
    assert.equal(PUBLIC_GUIDE_LINKS[12].coverTitle, FILMS_LIKE_FLOW_GUIDE.anchorTitle);
    assert.equal(
      listGuideFilmTitles(BEST_STOP_MOTION_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[0].coverTitle
      ),
      true
    );
    assert.equal(
      PUBLIC_GUIDE_LINKS[1].coverPosterPath,
      "/guides/clay-animation-movies/creature-comforts-cover.jpg"
    );
    assert.equal(
      listGuideItemListTitles(CLAY_ANIMATION_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[1].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[2].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(TOMM_MOORE_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[3].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideItemListTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[4].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(ADAM_ELLIOT_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[6].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[8].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(ANIMATION_STYLES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[9].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[10].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[11].coverTitle
      ),
      true
    );
  });
});

describe("christmas-new-year-animated-films editorial config", () => {
  it("keeps winter films as short-style rows with country and director", () => {
    const catalogTitles = listGuideFilmTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE);
    const allTitles = listGuideItemListTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE);
    const shortEntries = CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.groups.flatMap((group) =>
      group.films.filter((entry) => isGuideShortFilmEntry(entry))
    );

    assert.deepEqual(catalogTitles, []);
    assert.equal(shortEntries.length, 10);
    assert.equal(allTitles.length, 10);
    assert.equal(new Set(allTitles).size, 10);
    assert.equal(
      CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.slug,
      "christmas-new-year-animated-films"
    );
    assert.equal(
      CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.h1,
      "Winter Magic: Animated Films for Grown-Ups"
    );
    assert.deepEqual(
      shortEntries.map((entry) => entry.title),
      [
        "Tony, Shelly and the Magic Light",
        "Winter's Blight",
        "Fuzzy Feelings",
        "Warm Snow",
        "Beloved",
        "Snow Bear",
        "Chucha",
        "Holiday",
        "The Boy, the Mole, the Fox and the Horse",
        "An Almost Christmas Story",
      ]
    );
    assert.equal(
      shortEntries.every(
        (entry) =>
          typeof entry.watchUrl === "string" &&
          String(entry.country ?? "").trim() &&
          String(entry.director ?? "").trim() &&
          !entry.watchUrl.includes("ondemand") &&
          !entry.watchUrl.includes("tapir.tv")
      ),
      true
    );
    const tony = shortEntries[0];
    const boyMole = shortEntries.find(
      (entry) => entry.title === "The Boy, the Mole, the Fox and the Horse"
    );
    const almostChristmas = shortEntries.find(
      (entry) => entry.title === "An Almost Christmas Story"
    );
    assert.equal(tony?.title, "Tony, Shelly and the Magic Light");
    assert.equal(Boolean(tony?.trailerUrl), true);
    assert.equal(String(tony?.watchUrl).includes("google.com/search"), true);
    assert.equal(Boolean(boyMole?.trailerUrl), true);
    assert.equal(String(boyMole?.watchUrl).includes("google.com/search"), true);
    assert.equal(Boolean(almostChristmas?.trailerUrl), true);
    assert.equal(
      shortEntries
        .filter(
          (entry) =>
            entry.title !== "Tony, Shelly and the Magic Light" &&
            entry.title !== "The Boy, the Mole, the Fox and the Horse" &&
            entry.title !== "An Almost Christmas Story"
        )
        .every((entry) => !entry.trailerUrl),
      true
    );
  });
});

