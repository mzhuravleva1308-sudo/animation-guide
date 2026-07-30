import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  POSTER_AUDIT_ISSUE,
  auditFilmPosters,
  classifyFilmPoster,
  isSuccessfulPosterResponse,
} from "./audit-film-posters.mjs";

const SUPABASE_URL = "https://example.supabase.co";
const brokenPoster = `${SUPABASE_URL}/storage/v1/object/public/film-posters/broken.jpg`;
const okPoster = `${SUPABASE_URL}/storage/v1/object/public/film-posters/ok.jpg`;

describe("classifyFilmPoster", () => {
  it("detects null poster_url", () => {
    assert.equal(
      classifyFilmPoster(
        { id: "1", title: "A", poster_url: null },
        SUPABASE_URL
      ).issue,
      POSTER_AUDIT_ISSUE.MISSING_POSTER_URL
    );
  });

  it("detects external poster_url", () => {
    assert.equal(
      classifyFilmPoster(
        {
          id: "1",
          title: "A",
          poster_url: "https://image.tmdb.org/t/p/w500/x.jpg",
        },
        SUPABASE_URL
      ).issue,
      POSTER_AUDIT_ISSUE.EXTERNAL_POSTER_URL
    );
  });

  it("accepts Storage film-posters URLs for the configured supabase host", () => {
    assert.equal(
      classifyFilmPoster(
        { id: "1", title: "A", poster_url: okPoster },
        SUPABASE_URL
      ).issue,
      null
    );
  });
});

describe("auditFilmPosters", () => {
  it("reports null, external, and broken Storage posters", async () => {
    const report = await auditFilmPosters(
      [
        { id: "1", title: "Missing", poster_url: null },
        {
          id: "2",
          title: "External",
          poster_url: "https://image.tmdb.org/t/p/w500/x.jpg",
        },
        { id: "3", title: "Broken", poster_url: brokenPoster },
        { id: "4", title: "Ok", poster_url: okPoster },
      ],
      SUPABASE_URL,
      {
        checkUrl: async (url) => {
          if (url === brokenPoster) {
            return {
              ok: false,
              status: 404,
              headers: { get: () => "text/plain" },
            };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: () => "image/jpeg" },
          };
        },
      }
    );

    assert.equal(report.total, 4);
    assert.equal(report.missingPosterUrl, 1);
    assert.equal(report.externalPosterUrl, 1);
    assert.equal(report.brokenStoragePoster, 1);
    assert.equal(report.validCachedPosters, 1);
    assert.equal(report.issues.length, 3);
    assert.deepEqual(
      report.issues.map((row) => row.issue).sort(),
      [
        POSTER_AUDIT_ISSUE.BROKEN_STORAGE_POSTER,
        POSTER_AUDIT_ISSUE.EXTERNAL_POSTER_URL,
        POSTER_AUDIT_ISSUE.MISSING_POSTER_URL,
      ]
    );
  });
});

describe("isSuccessfulPosterResponse", () => {
  it("requires ok image responses", () => {
    assert.equal(
      isSuccessfulPosterResponse({
        ok: true,
        headers: { get: () => "image/jpeg" },
      }),
      true
    );
    assert.equal(
      isSuccessfulPosterResponse({
        ok: false,
        status: 403,
        headers: { get: () => "text/html" },
      }),
      false
    );
  });
});
