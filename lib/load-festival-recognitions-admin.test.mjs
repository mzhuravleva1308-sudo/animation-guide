import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeFestivalClaimsAdmin,
  summarizeFestivalRecognitionsAdmin,
} from "./load-festival-recognitions-admin.mjs";

describe("summarizeFestivalClaimsAdmin", () => {
  it("counts claim statuses and source types", () => {
    const summary = summarizeFestivalClaimsAdmin([
      {
        id: "1",
        film_id: "a",
        raw_festival_name: "Annecy",
        canonical_festival_id: "annecy",
        festival_year: 2022,
        section: null,
        recognition_type: "award",
        award_name: "Jury Prize",
        source_type: "wikipedia",
        source_url: "https://en.wikipedia.org/wiki/Example",
        claim_status: "discovered_unverified",
        verification_reason: null,
        official_url: null,
        film: { id: "a", title: "No Dogs or Italians Allowed", year: 2022 },
      },
      {
        id: "2",
        film_id: "a",
        raw_festival_name: "Annecy",
        canonical_festival_id: "annecy",
        festival_year: 2022,
        section: null,
        recognition_type: "award",
        award_name: "GAN Foundation Prize",
        source_type: "wikipedia",
        source_url: "https://en.wikipedia.org/wiki/Example",
        claim_status: "confirmed",
        verification_reason: "Official proof found",
        official_url: "https://www.annecyfestival.com/about/archives:en/2022:en/award-winners",
        film: { id: "a", title: "No Dogs or Italians Allowed", year: 2022 },
      },
    ]);

    assert.equal(summary.totalClaims, 2);
    assert.equal(summary.uniqueFilms, 1);
    assert.equal(summary.byStatus.length, 2);
    assert.equal(summary.bySourceType[0]?.label, "wikipedia");
  });
});

describe("summarizeFestivalRecognitionsAdmin", () => {
  it("counts rows, films, and breakdowns", () => {
    const summary = summarizeFestivalRecognitionsAdmin([
      {
        id: "1",
        film_id: "a",
        festival_name: "Annecy International Animation Film Festival",
        normalized_festival_name: "annecy",
        festival_year: 1995,
        section: null,
        recognition_type: "winner",
        award_name: "Grand Prix",
        award_level: "grand_prize",
        source_url: "https://www.annecyfestival.com/example",
        source_label: "annecyfestival.com",
        source_type: "official_archive",
        import_source: "catalog_backfill_v1",
        created_at: "2026-06-21T00:00:00.000Z",
        film: { id: "a", title: "Pom Poko", year: 1994 },
      },
      {
        id: "2",
        film_id: "a",
        festival_name: "Annecy International Animation Film Festival",
        normalized_festival_name: "annecy",
        festival_year: 1995,
        section: null,
        recognition_type: "winner",
        award_name: "Grand Prix",
        award_level: "grand_prize",
        source_url: "https://www.annecyfestival.com/example",
        source_label: "annecyfestival.com",
        source_type: "official_archive",
        import_source: "catalog_backfill_v1",
        created_at: "2026-06-21T00:00:00.000Z",
        film: { id: "a", title: "Pom Poko", year: 1994 },
      },
      {
        id: "3",
        film_id: "b",
        festival_name: "Berlin International Film Festival",
        normalized_festival_name: "berlinale",
        festival_year: 2010,
        section: null,
        recognition_type: "screening",
        award_name: null,
        award_level: null,
        source_url: "https://www.berlinale.de/example",
        source_label: "berlinale.de",
        source_type: "official_archive",
        import_source: "catalog_backfill_v1",
        created_at: "2026-06-21T00:00:00.000Z",
        film: { id: "b", title: "The Illusionist", year: 2010 },
      },
    ]);

    assert.equal(summary.totalRows, 3);
    assert.equal(summary.uniqueFilms, 2);
    assert.equal(summary.byFestival[0]?.label, "Annecy International Animation Film Festival");
    assert.equal(summary.byFestival[0]?.count, 2);
    assert.equal(summary.byImportSource[0]?.label, "catalog_backfill_v1");
    assert.equal(summary.byRecognitionType.length, 2);
  });
});
