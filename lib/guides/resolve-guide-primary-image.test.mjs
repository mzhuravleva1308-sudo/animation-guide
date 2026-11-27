import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findGuidePosterInPageOrder,
  resolveGuidePrimaryImage,
} from "./resolve-guide-primary-image.mjs";

describe("findGuidePosterInPageOrder", () => {
  it("walks groups in page order and skips prose/cards", () => {
    const poster = findGuidePosterInPageOrder({
      groups: [
        {
          items: [
            { kind: "prose", text: "Skip" },
            {
              kind: "catalog",
              film: {
                title: "A Boat in the Garden",
                poster_url: "https://cdn.example/boat.jpg",
              },
            },
            {
              kind: "catalog",
              film: {
                title: "Birdboy: The Forgotten Children",
                poster_url: "https://cdn.example/birdboy.jpg",
              },
            },
          ],
        },
      ],
    });
    assert.equal(poster, "https://cdn.example/boat.jpg");
  });

  it("can match a later coverTitle without taking the first film", () => {
    const poster = findGuidePosterInPageOrder(
      {
        groups: [
          {
            items: [
              {
                kind: "catalog",
                film: {
                  title: "My Love Affair with Marriage",
                  poster_url: "https://cdn.example/marriage.jpg",
                },
              },
              {
                kind: "catalog",
                film: {
                  title: "Mars Express",
                  poster_url: "https://cdn.example/mars.jpg",
                },
              },
            ],
          },
        ],
      },
      "Mars Express"
    );
    assert.equal(poster, "https://cdn.example/mars.jpg");
  });
});

describe("resolveGuidePrimaryImage", () => {
  it("prefers static coverPosterPath for clay guide", () => {
    const image = resolveGuidePrimaryImage(
      {
        groups: [
          {
            items: [
              {
                kind: "catalog",
                film: {
                  title: "Chicken Run",
                  poster_url: "https://cdn.example/chicken.jpg",
                },
              },
            ],
          },
        ],
      },
      { slug: "clay-animation-movies" }
    );
    assert.equal(
      image,
      "/guides/clay-animation-movies/creature-comforts-cover.jpg"
    );
  });

  it("uses coverTitle Mars Express for adults instead of first film", () => {
    const image = resolveGuidePrimaryImage(
      {
        groups: [
          {
            items: [
              {
                kind: "catalog",
                film: {
                  title: "My Love Affair with Marriage",
                  poster_url: "https://cdn.example/marriage.jpg",
                },
              },
              {
                kind: "catalog",
                film: {
                  title: "Mars Express",
                  poster_url: "https://cdn.example/mars.jpg",
                },
              },
            ],
          },
        ],
      },
      { slug: "best-animated-movies-for-adults" }
    );
    assert.equal(image, "https://cdn.example/mars.jpg");
  });

  it("uses explicit seoImage for films-like-flow over list posters", () => {
    const image = resolveGuidePrimaryImage(
      {
        anchorFilm: {
          title: "Flow",
          poster_url: "https://cdn.example/flow.jpg",
        },
        groups: [
          {
            items: [
              {
                kind: "catalog",
                film: {
                  title: "A Boat in the Garden",
                  poster_url: "https://cdn.example/boat.jpg",
                },
              },
              {
                kind: "catalog",
                film: {
                  title: "Birdboy: The Forgotten Children",
                  poster_url: "https://cdn.example/birdboy.jpg",
                },
              },
            ],
          },
        ],
      },
      { slug: "films-like-flow" }
    );
    assert.equal(image, "/guides/films-like-flow/seo.jpg");
  });

  it("falls back to first similar film when like-guide has no seoImage", () => {
    const image = resolveGuidePrimaryImage(
      {
        anchorFilm: {
          title: "Spirited Away",
          poster_url: "https://cdn.example/spirited.jpg",
        },
        groups: [
          {
            items: [
              {
                kind: "catalog",
                film: {
                  title: "Ghost Cat Anzu",
                  poster_url: "https://cdn.example/anzu.jpg",
                },
              },
            ],
          },
        ],
      },
      { slug: "films-like-spirited-away" }
    );
    assert.equal(image, "https://cdn.example/anzu.jpg");
  });

  it("falls back to anchor poster when a like-guide has no seoImage or listed posters", () => {
    const image = resolveGuidePrimaryImage(
      {
        anchorFilm: {
          title: "Coraline",
          poster_url: "https://cdn.example/coraline.jpg",
        },
        groups: [{ items: [{ kind: "prose", text: "Empty list." }] }],
      },
      { slug: "films-like-coraline" }
    );
    assert.equal(image, "https://cdn.example/coraline.jpg");
  });

  it("uses festival coverTitle when slug is a festival award page", () => {
    const image = resolveGuidePrimaryImage(
      {
        groups: [
          {
            items: [
              {
                kind: "catalog",
                film: {
                  title: "Some Other Film",
                  poster_url: "https://cdn.example/other.jpg",
                },
              },
              {
                kind: "catalog",
                film: {
                  title: "The Violinist",
                  poster_url: "https://cdn.example/violinist.jpg",
                },
              },
            ],
          },
        ],
      },
      { slug: "annecy" }
    );
    assert.equal(image, "https://cdn.example/violinist.jpg");
  });
});
