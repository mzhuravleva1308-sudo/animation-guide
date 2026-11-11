import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  absolutizeJsonLdUrl,
  buildGuideJsonLd,
  listGuideJsonLdFilms,
} from "./build-guide-json-ld.mjs";

describe("buildGuideJsonLd", () => {
  it("builds CollectionPage, ItemList, and breadcrumb graph", () => {
    const jsonLd = buildGuideJsonLd({
      origin: "https://resonale.com",
      path: "/guides/beautiful-animated-films",
      name: "Beautiful Animated Films Worth Discovering",
      description: "Beautiful animated films worth discovering.",
      films: [
        {
          name: "Arco",
          image: "https://example.com/arco.jpg",
          director: "Ugo Bienvenu",
          dateCreated: "2025",
        },
        {
          name: "Tito and the Birds",
          image: "https://example.com/tito.jpg",
          director: "Gustavo Steinberg",
          dateCreated: "2018",
        },
      ],
    });

    assert.equal(jsonLd["@context"], "https://schema.org");
    const types = jsonLd["@graph"].map((node) => node["@type"]);
    assert.deepEqual(types, [
      "CollectionPage",
      "ItemList",
      "BreadcrumbList",
      "WebSite",
    ]);

    const list = jsonLd["@graph"].find((node) => node["@type"] === "ItemList");
    assert.equal(list.numberOfItems, 2);
    assert.equal(list.itemListElement[0].item.name, "Arco");
    assert.equal(list.itemListElement[0].item["@type"], "Movie");
    assert.equal(
      list.itemListElement[0].item.image,
      "https://example.com/arco.jpg"
    );
    assert.deepEqual(list.itemListElement[0].item.director, {
      "@type": "Person",
      name: "Ugo Bienvenu",
    });
    assert.equal(list.itemListElement[0].item.dateCreated, "2025");
    const breadcrumb = jsonLd["@graph"].find(
      (node) => node["@type"] === "BreadcrumbList"
    );
    assert.deepEqual(
      breadcrumb.itemListElement.map((item) => item.name),
      [
        "Home",
        "Guides",
        "Beautiful Animated Films Worth Discovering",
      ]
    );
  });

  it("omits empty movie fields", () => {
    const jsonLd = buildGuideJsonLd({
      origin: "https://resonale.com",
      path: "/guides/adam-elliot-movies",
      name: "Adam Elliot Movies",
      description: "Adam Elliot movies.",
      films: [{ name: "Mary and Max" }],
    });
    const list = jsonLd["@graph"].find((node) => node["@type"] === "ItemList");
    assert.deepEqual(list.itemListElement[0].item, {
      "@type": "Movie",
      name: "Mary and Max",
    });
  });

  it("absolutizes relative short-film poster paths", () => {
    const jsonLd = buildGuideJsonLd({
      origin: "https://resonale.com",
      path: "/guides/adam-elliot-movies",
      name: "Adam Elliot Movies",
      description: "Adam Elliot movies.",
      films: [
        {
          name: "Uncle",
          image: "/guides/adam-elliot-movies/uncle.jpg",
          dateCreated: "1996",
        },
      ],
    });
    const list = jsonLd["@graph"].find((node) => node["@type"] === "ItemList");
    assert.equal(
      list.itemListElement[0].item.image,
      "https://resonale.com/guides/adam-elliot-movies/uncle.jpg"
    );
  });

  it("includes datePublished and dateModified when provided", () => {
    const jsonLd = buildGuideJsonLd({
      origin: "https://resonale.com",
      path: "/guides/adam-elliot-movies",
      name: "Adam Elliot Movies",
      description: "Adam Elliot movies.",
      films: [{ name: "Mary and Max" }],
      datePublished: "2026-11-07",
      dateModified: "2026-11-07",
    });
    const page = jsonLd["@graph"].find(
      (node) => node["@type"] === "CollectionPage"
    );
    assert.equal(page.datePublished, "2026-11-07");
    assert.equal(page.dateModified, "2026-11-07");
  });

  it("links CollectionPage author to a stable Person @id when includeAuthor", () => {
    const jsonLd = buildGuideJsonLd({
      origin: "https://resonale.com",
      path: "/guides/films-like-flow",
      name: "9 Movies Like Flow",
      description: "Films like Flow.",
      films: [{ name: "Flow" }],
      includeAuthor: true,
    });
    const page = jsonLd["@graph"].find(
      (node) => node["@type"] === "CollectionPage"
    );
    const author = jsonLd["@graph"].find((node) => node["@type"] === "Person");
    assert.deepEqual(page.author, { "@id": "https://resonale.com/#maria" });
    assert.deepEqual(author, {
      "@type": "Person",
      "@id": "https://resonale.com/#maria",
      name: "Maria",
    });
  });
});

describe("listGuideJsonLdFilms", () => {
  it("maps catalog and short items with poster/director/year", () => {
    const films = listGuideJsonLdFilms([
      {
        items: [
          {
            kind: "catalog",
            film: {
              title: "Boy and the World",
              poster_url: "https://cdn.example/boy.jpg",
              image_url: "https://cdn.example/boy-fallback.jpg",
              director: "Alê Abreu",
              year: 2013,
            },
            note: null,
          },
          {
            kind: "short",
            title: "Harvie Krumpet",
            year: 2003,
            posterUrl: "https://cdn.example/harvie.jpg",
          },
          { kind: "prose", text: "Skip me." },
        ],
      },
    ]);

    assert.deepEqual(films, [
      {
        name: "Boy and the World",
        image: "https://cdn.example/boy.jpg",
        director: "Alê Abreu",
        dateCreated: "2013",
      },
      {
        name: "Harvie Krumpet",
        image: "https://cdn.example/harvie.jpg",
        director: null,
        dateCreated: "2003",
      },
    ]);
  });

  it("falls back to image_url when poster_url is missing", () => {
    const films = listGuideJsonLdFilms([
      {
        items: [
          {
            kind: "catalog",
            film: {
              title: "Padak",
              poster_url: null,
              image_url: "https://cdn.example/padak.jpg",
              director: "Lee Dae-hee",
              year: 2012,
            },
          },
        ],
      },
    ]);
    assert.equal(films[0].image, "https://cdn.example/padak.jpg");
  });
});

describe("absolutizeJsonLdUrl", () => {
  it("keeps absolute URLs and prefixes site-relative paths", () => {
    assert.equal(
      absolutizeJsonLdUrl("https://resonale.com", "https://cdn.example/a.jpg"),
      "https://cdn.example/a.jpg"
    );
    assert.equal(
      absolutizeJsonLdUrl("https://resonale.com/", "/guides/x.jpg"),
      "https://resonale.com/guides/x.jpg"
    );
    assert.equal(absolutizeJsonLdUrl("https://resonale.com", ""), null);
  });
});
