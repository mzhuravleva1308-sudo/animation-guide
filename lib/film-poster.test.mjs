import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPosterStoragePath,
  buildPublicPosterUrl,
  extensionForContentType,
  filmNeedsPosterCache,
  getExternalImageSource,
  getFilmPosterUrl,
  isCachedPosterUrl,
} from "./film-poster.mjs";

const SUPABASE_URL = "https://example.supabase.co";

describe("getFilmPosterUrl", () => {
  it("prefers cached poster_url over image_url", () => {
    const url = getFilmPosterUrl({
      poster_url: "https://example.supabase.co/storage/v1/object/public/film-posters/abc.jpg",
      image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
    });

    assert.equal(
      url,
      "https://example.supabase.co/storage/v1/object/public/film-posters/abc.jpg"
    );
  });

  it("falls back to image_url when poster_url is missing", () => {
    const url = getFilmPosterUrl({
      poster_url: null,
      image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
    });

    assert.equal(url, "https://image.tmdb.org/t/p/w500/poster.jpg");
  });
});

describe("getExternalImageSource", () => {
  it("prefers external_image_url over image_url", () => {
    const url = getExternalImageSource({
      external_image_url: "https://image.tmdb.org/t/p/w500/original.jpg",
      image_url: "https://example.supabase.co/storage/v1/object/public/film-posters/abc.jpg",
    });

    assert.equal(url, "https://image.tmdb.org/t/p/w500/original.jpg");
  });
});

describe("isCachedPosterUrl", () => {
  it("detects Supabase film-posters public URLs", () => {
    assert.equal(
      isCachedPosterUrl(
        "https://example.supabase.co/storage/v1/object/public/film-posters/film-id.webp",
        SUPABASE_URL
      ),
      true
    );
  });

  it("returns false for external poster URLs", () => {
    assert.equal(
      isCachedPosterUrl("https://image.tmdb.org/t/p/w500/poster.jpg", SUPABASE_URL),
      false
    );
  });

  it("does not hardcode a specific project domain", () => {
    assert.equal(
      isCachedPosterUrl(
        "https://other.supabase.co/storage/v1/object/public/film-posters/x.jpg",
        "https://other.supabase.co"
      ),
      true
    );
    assert.equal(
      isCachedPosterUrl(
        "https://other.supabase.co/storage/v1/object/public/film-posters/x.jpg",
        SUPABASE_URL
      ),
      false
    );
  });
});

describe("filmNeedsPosterCache", () => {
  it("skips films that already have poster_url unless force is set", () => {
    const film = {
      poster_url: `${SUPABASE_URL}/storage/v1/object/public/film-posters/abc.jpg`,
      image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
    };

    assert.equal(filmNeedsPosterCache(film, SUPABASE_URL), false);
    assert.equal(filmNeedsPosterCache(film, SUPABASE_URL, { force: true }), true);
  });

  it("requires an external source image", () => {
    assert.equal(
      filmNeedsPosterCache({ poster_url: null, image_url: null }, SUPABASE_URL),
      false
    );
  });
});

describe("extensionForContentType", () => {
  it("maps common image content types", () => {
    assert.equal(extensionForContentType("image/webp"), "webp");
    assert.equal(extensionForContentType("image/png"), "png");
    assert.equal(extensionForContentType("image/jpeg; charset=binary"), "jpg");
    assert.equal(extensionForContentType(undefined), "jpg");
  });
});

describe("poster storage paths", () => {
  it("builds deterministic file names from film id", () => {
    assert.equal(buildPosterStoragePath("film-123", "jpg"), "film-123.jpg");
  });

  it("builds public poster URLs", () => {
    assert.equal(
      buildPublicPosterUrl(SUPABASE_URL, "film-123", "webp"),
      "https://example.supabase.co/storage/v1/object/public/film-posters/film-123.webp"
    );
  });
});
