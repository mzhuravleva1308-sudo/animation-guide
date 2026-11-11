import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADAM_ELLIOT_MOVIES_GUIDE } from "./adam-elliot-movies.mjs";
import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_CORALINE_GUIDE } from "./films-like-coraline.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "./indie-animated-movies-beyond-studios.mjs";
import { STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE } from "./strange-festival-animated-movies.mjs";
import { getCatalogGuideLink } from "./catalog-guide-links.mjs";
import { PUBLIC_GUIDE_LINKS } from "./public-guide-links.mjs";
import {
  findGuideFilmByTitle,
  isGuideShortFilmEntry,
  listGuideFilmTitles,
  listGuideItemListTitles,
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

describe("films-like-coraline editorial config", () => {
  it("has three groups of three unique catalog titles unused by other guides", () => {
    const titles = listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE),
      ...listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE),
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
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      FILMS_LIKE_CORALINE_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE),
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
        "/guides/films-like-coraline",
        "/guides/strange-festival-animated-movies",
        "/guides/indie-animated-movies-beyond-studios",
        "/guides/adam-elliot-movies",
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

describe("indie-animated-movies-beyond-studios editorial config", () => {
  it("has three groups of three unique catalog titles unused by other guides", () => {
    const titles = listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE);
    const occupied = new Set([
      FILMS_LIKE_FLOW_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE),
      FILMS_LIKE_CORALINE_GUIDE.anchorTitle,
      ...listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE),
      ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE),
      ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE),
      ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE),
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
      "Mary and Max",
      "Savages",
      "Anomalisa",
      "The Glassworker",
      "Wrinkles",
      "Sultana's Dream",
    ]);
    assert.deepEqual(
      INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.relatedGuides?.map((guide) => guide.href),
      [
        "/guides/films-like-flow",
        "/guides/films-like-coraline",
        "/guides/beautiful-animated-films",
        "/guides/strange-festival-animated-movies",
        "/guides/animation-styles",
        "/guides/adam-elliot-movies",
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

  it("links Adam Elliot features to the Adam Elliot guide", () => {
    assert.deepEqual(getCatalogGuideLink("Mary and Max"), {
      href: "/guides/adam-elliot-movies",
      label: "Adam Elliot movies",
    });
    assert.deepEqual(getCatalogGuideLink("Memoir of a Snail"), {
      href: "/guides/adam-elliot-movies",
      label: "Adam Elliot movies",
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
    // Shared with Adam Elliot guide — director filmography wins.
    assert.notEqual(
      getCatalogGuideLink("Memoir of a Snail")?.href,
      "/guides/animation-styles"
    );
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
    // Shared with Adam Elliot guide — director filmography wins.
    assert.notEqual(
      getCatalogGuideLink("Mary and Max")?.href,
      "/guides/indie-animated-movies-beyond-studios"
    );
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

describe("PUBLIC_GUIDE_LINKS", () => {
  it("lists editorial guides newest-first by publishedAt", () => {
    assert.deepEqual(
      PUBLIC_GUIDE_LINKS.map((guide) => guide.href),
      [
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
        "2026-11-07",
        "2026-11-05",
        "2026-11-07",
        "2026-11-07",
        "2026-11-05",
        "2026-11-05",
        "2026-11-05",
      ]
    );
    for (let i = 1; i < PUBLIC_GUIDE_LINKS.length; i += 1) {
      assert.equal(
        PUBLIC_GUIDE_LINKS[i - 1].publishedAt >= PUBLIC_GUIDE_LINKS[i].publishedAt,
        true
      );
    }
    assert.equal(PUBLIC_GUIDE_LINKS[0].label, "Adam Elliot movies");
    assert.equal(PUBLIC_GUIDE_LINKS[1].label, "9 Movies Like Coraline");
    assert.equal(PUBLIC_GUIDE_LINKS[2].label, "Indie animated movies beyond the studios");
    assert.equal(PUBLIC_GUIDE_LINKS[3].label, "Animation styles");
    assert.equal(PUBLIC_GUIDE_LINKS[4].label, "Strange festival animated movies");
    assert.equal(PUBLIC_GUIDE_LINKS[5].label, "Beautiful animated films");
    assert.equal(PUBLIC_GUIDE_LINKS[6].label, "9 Movies Like Flow");
    assert.equal(PUBLIC_GUIDE_LINKS[0].title, ADAM_ELLIOT_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[1].title, FILMS_LIKE_CORALINE_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[2].title, INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[3].title, ANIMATION_STYLES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[4].title, STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[5].title, BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[6].title, FILMS_LIKE_FLOW_GUIDE.h1);
    assert.equal(PUBLIC_GUIDE_LINKS[0].coverTitle, "Mary and Max");
    assert.equal(PUBLIC_GUIDE_LINKS[1].coverTitle, "Coraline");
    assert.equal(PUBLIC_GUIDE_LINKS[1].coverTitle, FILMS_LIKE_CORALINE_GUIDE.anchorTitle);
    assert.equal(PUBLIC_GUIDE_LINKS[2].coverTitle, "The Painting");
    assert.equal(PUBLIC_GUIDE_LINKS[3].coverTitle, "Fantastic Planet");
    assert.equal(PUBLIC_GUIDE_LINKS[4].coverTitle, "Nobody");
    assert.equal(PUBLIC_GUIDE_LINKS[5].coverTitle, "Arco");
    assert.equal(PUBLIC_GUIDE_LINKS[6].coverTitle, "Flow");
    assert.equal(PUBLIC_GUIDE_LINKS[6].coverTitle, FILMS_LIKE_FLOW_GUIDE.anchorTitle);
    assert.equal(
      listGuideFilmTitles(ADAM_ELLIOT_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[0].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE).includes(
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
      listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[4].coverTitle
      ),
      true
    );
    assert.equal(
      listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE).includes(
        PUBLIC_GUIDE_LINKS[5].coverTitle
      ),
      true
    );
  });
});

