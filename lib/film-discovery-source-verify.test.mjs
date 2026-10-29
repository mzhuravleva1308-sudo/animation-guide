import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessCandidateSourceCredibility,
  assessSourceUrlCredibility,
  looksLikePlaceholderDigitRun,
  verifyCandidateExistsOnTmdb,
} from "./film-discovery-source-verify.mjs";
import { reviewCandidateEligibility } from "./film-discovery-eligibility.mjs";

describe("film-discovery-source-verify", () => {
  it("flags sequential IMDb ids", () => {
    assert.equal(looksLikePlaceholderDigitRun("1234567"), true);
    assert.equal(looksLikePlaceholderDigitRun("2345678"), true);
    assert.equal(looksLikePlaceholderDigitRun("1111111"), true);
    assert.equal(looksLikePlaceholderDigitRun("0451272"), false);
  });

  it("rejects placeholder IMDb and invented festival hosts", () => {
    const imdb = assessSourceUrlCredibility(
      "https://www.imdb.com/title/tt1234567/"
    );
    assert.equal(imdb.ok, false);
    assert.ok(imdb.issues.some((i) => i.startsWith("placeholder_imdb_id")));

    const fest = assessSourceUrlCredibility(
      "https://www.bulgarianfilmfestival.com/films/x"
    );
    assert.equal(fest.ok, false);
  });

  it("accepts a normal IMDb title URL on a trusted host", () => {
    const report = assessSourceUrlCredibility(
      "https://www.imdb.com/title/tt0451272/"
    );
    assert.equal(report.ok, true);
  });

  it("fails candidate with only invented sources", () => {
    const check = assessCandidateSourceCredibility({
      source_urls: [
        "https://www.imdb.com/title/tt1234567/",
        "https://www.bhfilmfestival.com/films/the-last-bus",
      ],
    });
    assert.equal(check.ok, false);
    assert.equal(check.reason_code, "insufficient_sources");
  });

  it("eligibility fails invented sources", () => {
    const review = reviewCandidateEligibility({
      title: "The Last Bus",
      original_title: null,
      year: 2021,
      directors: ["Someone"],
      countries: ["Bosnia"],
      runtime_minutes: 90,
      source_urls: ["https://www.imdb.com/title/tt1234567/"],
      researcher_why: "gap",
      manager_why: "gap",
      requirement_evidence: {
        full_length_feature: "90m",
        fully_animated: "yes",
        no_live_action_or_archive: "yes",
        not_children_oriented: "yes",
        independent_auteur_or_festival: "yes",
        not_in_catalog: "yes",
        standalone_release: "yes",
        reliable_sources: "imdb",
      },
    });
    assert.equal(review.result, "FAIL");
    assert.equal(review.reason_code, "insufficient_sources");
  });

  it("TMDB verify fails when no accepted match", async () => {
    const result = await verifyCandidateExistsOnTmdb(
      { title: "Fake Film", year: 2020 },
      {
        tmdbApiKey: "test",
        findMatch: async () => ({
          match: null,
          evaluation: { accepted: false },
          candidatesTried: 0,
        }),
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no_tmdb_identity_match");
  });
});
