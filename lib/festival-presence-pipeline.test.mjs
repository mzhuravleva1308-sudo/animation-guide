import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFestivalYearHints,
  dedupeExtractedRecognitions,
  extractAnnecyRecognitionsFromHtml,
} from "./festival-presence-pipeline.mjs";

const SAMPLE_AWARD_HTML = `
<h2>Audience Award</h2>
<h4>Couleur de peau : miel</h4>
<h2>Unicef Award</h2>
<h4>Couleur de peau : miel</h4>
`;

const SAMPLE_CRISTAL_HTML = `
<h2>Cristal for a Feature Film</h2>
<h4>Avril et le Monde truqué</h4>
`;

describe("buildFestivalYearHints", () => {
  it("includes claim year, film year, and neighbors", () => {
    assert.deepEqual(buildFestivalYearHints({ year: 2015 }, { festival_year: 2013 }), [
      2013,
      2015,
      2012,
      2014,
      2014,
      2016,
    ].filter((year, index, all) => all.indexOf(year) === index));
  });
});

describe("extractAnnecyRecognitionsFromHtml", () => {
  it("extracts multiple awards for the same film", () => {
    const film = {
      title: "Approved for Adoption",
      original_title: "Couleur de peau: Miel",
    };

    const recognitions = extractAnnecyRecognitionsFromHtml(
      SAMPLE_AWARD_HTML,
      film,
      2012,
      "https://www.annecyfestival.com/about/archives:en/2012:en/award-winners"
    );

    assert.equal(recognitions.length, 2);
    assert.deepEqual(
      recognitions.map((row) => row.award_name).sort(),
      ["Audience Award", "Unicef Award"]
    );
    assert.equal(recognitions[0].evidence_status, "confirmed_official_source");
  });

  it("extracts cristal winner by original French title", () => {
    const film = {
      title: "April and the Extraordinary World",
      original_title: "Avril et le Monde truqué",
    };

    const recognitions = extractAnnecyRecognitionsFromHtml(
      SAMPLE_CRISTAL_HTML,
      film,
      2015,
      "https://www.annecyfestival.com/about/archives:en/2015:en/award-winners"
    );

    assert.equal(recognitions.length, 1);
    assert.match(recognitions[0].award_name ?? "", /Cristal/i);
  });
});

describe("dedupeExtractedRecognitions", () => {
  it("dedupes by award and year", () => {
    const rows = dedupeExtractedRecognitions([
      {
        festival_year: 2012,
        recognition_type: "award",
        award_name: "Audience Award",
        section: null,
      },
      {
        festival_year: 2012,
        recognition_type: "award",
        award_name: "Audience Award",
        section: null,
      },
    ]);

    assert.equal(rows.length, 1);
  });
});
