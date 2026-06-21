import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFestivalRecognitionDedupeKey,
  getFestivalRecognitionSignalWeight,
  normalizeAwardLevel,
  normalizeFestivalName,
  normalizeRecognitionType,
  parseFilmFestivalRecognitionImportEntry,
  parseFilmFestivalRecognitionImportPayload,
  parseFilmFestivalRecognitionInput,
  toFilmFestivalRecognitionRow,
} from "./film-festival-recognition.mjs";

describe("normalizeRecognitionType", () => {
  it("accepts canonical values and normalizes spacing", () => {
    assert.equal(normalizeRecognitionType("official_selection"), "official_selection");
    assert.equal(normalizeRecognitionType("Official Selection"), "official_selection");
    assert.equal(normalizeRecognitionType("unknown"), null);
  });
});

describe("normalizeAwardLevel", () => {
  it("accepts canonical award levels", () => {
    assert.equal(normalizeAwardLevel("grand_prize"), "grand_prize");
    assert.equal(normalizeAwardLevel("Jury Prize"), "jury_prize");
    assert.equal(normalizeAwardLevel("invalid"), null);
  });
});

describe("normalizeFestivalName", () => {
  it("normalizes festival names for filtering", () => {
    assert.equal(
      normalizeFestivalName("Annecy International Animated Film Festival"),
      "annecy international animated film festival"
    );
    assert.equal(normalizeFestivalName("  Sundance  "), "sundance");
  });
});

describe("parseFilmFestivalRecognitionInput", () => {
  it("parses a complete recognition record", () => {
    const result = parseFilmFestivalRecognitionInput({
      festival_name: "Annecy International Animated Film Festival",
      festival_year: 2024,
      section: "Official Competition",
      recognition_type: "winner",
      award_name: "Crystal for Best Short Film",
      award_level: "grand_prize",
      source_url: "https://www.annecy.org/winners/2024",
      import_source: "enrichment_pipeline",
      import_key: "annecy-2024-crystal",
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.value.festival_name, "Annecy International Animated Film Festival");
    assert.equal(result.value.festival_year, 2024);
    assert.equal(result.value.section, "Official Competition");
    assert.equal(result.value.recognition_type, "winner");
    assert.equal(result.value.award_name, "Crystal for Best Short Film");
    assert.equal(result.value.award_level, "grand_prize");
    assert.equal(
      result.value.source_url,
      "https://www.annecy.org/winners/2024"
    );
  });

  it("rejects invalid festival years and source URLs", () => {
    assert.equal(
      parseFilmFestivalRecognitionInput({
        festival_name: "Sundance",
        festival_year: 1800,
        recognition_type: "screening",
      }).ok,
      false
    );

    assert.equal(
      parseFilmFestivalRecognitionInput({
        festival_name: "Sundance",
        recognition_type: "screening",
        source_url: "not-a-url",
      }).ok,
      false
    );
  });

  it("drops award metadata for screening and official selection", () => {
    const result = parseFilmFestivalRecognitionInput({
      festival_name: "Ottawa International Animation Festival",
      festival_year: 2023,
      recognition_type: "screening",
      award_name: "Should be ignored",
      award_level: "grand_prize",
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.value.award_name, "Should be ignored");
    assert.equal(result.value.award_level, null);
  });
});

describe("buildFestivalRecognitionDedupeKey", () => {
  it("builds a stable dedupe key", () => {
    const key = buildFestivalRecognitionDedupeKey({
      normalized_festival_name: "annecy",
      festival_year: 2024,
      recognition_type: "winner",
      normalized_award_name: "crystal for best short film",
      section: "Official Competition",
    });

    assert.equal(
      key,
      "annecy|2024|winner|crystal for best short film|Official Competition"
    );
  });
});

describe("getFestivalRecognitionSignalWeight", () => {
  it("ranks stronger recognitions higher and gives screening zero weight", () => {
    const winner = getFestivalRecognitionSignalWeight({
      recognition_type: "winner",
      award_level: "grand_prize",
    });
    const screening = getFestivalRecognitionSignalWeight({
      recognition_type: "screening",
      award_level: null,
    });

    assert.equal(screening, 0);
    assert.ok(winner > screening);
  });
});

describe("toFilmFestivalRecognitionRow", () => {
  it("maps parsed input to a database row shape", () => {
    const parsed = parseFilmFestivalRecognitionInput({
      festival_name: "Annecy",
      festival_year: 2024,
      recognition_type: "nominee",
      award_name: "Crystal for Best Short Film",
      award_level: "category_award",
      import_key: "annecy|2024|nominee|crystal for best short film|",
    });

    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }

    const row = toFilmFestivalRecognitionRow(parsed.value, "film-123");
    assert.equal(row.film_id, "film-123");
    assert.equal(row.normalized_festival_name, "annecy");
    assert.equal(row.normalized_award_name, "crystal for best short film");
    assert.match(row.dedupe_key, /^annecy\|2024\|nominee\|/);
  });
});

describe("parseFilmFestivalRecognitionImportPayload", () => {
  it("accepts a single entry object", () => {
    const result = parseFilmFestivalRecognitionImportPayload({
      film_id: "film-123",
      import_source: "enrichment_pipeline",
      recognitions: [
        {
          festival_name: "Annecy",
          festival_year: 2024,
          recognition_type: "official_selection",
          section: "Official Competition",
        },
      ],
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.value.length, 1);
    assert.equal(result.value[0].film_id, "film-123");
    assert.equal(
      result.value[0].recognitions[0].import_source,
      "enrichment_pipeline"
    );
  });

  it("accepts film_match entries for title-based resolution", () => {
    const result = parseFilmFestivalRecognitionImportEntry({
      film_match: {
        title: "Mary and Max",
        year: 2009,
      },
      recognitions: [
        {
          festival_name: "Sundance",
          festival_year: 2009,
          recognition_type: "screening",
        },
      ],
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.value.film_match?.title, "Mary and Max");
    assert.equal(result.value.film_match?.year, 2009);
  });

  it("rejects entries without film_id or film_match", () => {
    const result = parseFilmFestivalRecognitionImportPayload({
      recognitions: [
        {
          festival_name: "Annecy",
          recognition_type: "screening",
        },
      ],
    });

    assert.equal(result.ok, false);
  });
});
