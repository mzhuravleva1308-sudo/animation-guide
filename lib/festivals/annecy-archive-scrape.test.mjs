import test from "node:test";
import assert from "node:assert/strict";
import {
  annecyOfficialSelectionListUrl,
  parseAnnecyDirectors,
  parseAnnecyCountries,
  parseAnnecyFeatureListPage,
  selectAnnecyFeatureSeedRows,
  buildAnnecyCombinedSeedBatch,
  ANNECY_FEATURE_MIN_RUNTIME_MINUTES,
} from "./annecy-archive-scrape.mjs";

test("annecyOfficialSelectionListUrl builds :lm / :lmcc", () => {
  assert.equal(
    annecyOfficialSelectionListUrl(2012, "lm"),
    "https://www.annecyfestival.com/about/archives/2012/official-selection:lm"
  );
  assert.equal(
    annecyOfficialSelectionListUrl(2019, "lmcc"),
    "https://www.annecyfestival.com/about/archives/2019/official-selection:lmcc"
  );
});

test("parseAnnecyDirectors and countries split commas", () => {
  assert.deepEqual(parseAnnecyDirectors("Sam FELL, Chris BUTLER"), [
    "Sam FELL",
    "Chris BUTLER",
  ]);
  assert.deepEqual(
    parseAnnecyCountries("France, Belgium, South Korea"),
    ["France", "Belgium", "South Korea"]
  );
});

test("parseAnnecyFeatureListPage reads liste_films cards", () => {
  const html = `
    <ul class="liste_films cliquable">
      <li>
        <img src="https://io.annecyfestival.com/x/creative-works/20120589" alt="Arrugas">
        <h3>Arrugas</h3>
        <h4><span>Directed by: </span> Ignacio FERRERAS</h4>
        <h4><span>Country:</span> Spain</h4>
        <a href="https://www.annecy.org/about/archives/2012/official-selection/film-index:film-20120589"></a>
      </li>
      <li>
        <h3>ParaNorman</h3>
        <h4><span>Directed by: </span> Sam FELL, Chris BUTLER</h4>
        <h4><span>Country:</span> USA</h4>
        <a href="https://www.annecy.org/about/archives/2012/official-selection/film-index:film-20122425"></a>
      </li>
    </ul>`;
  const rows = parseAnnecyFeatureListPage(html, {
    festivalYear: 2012,
    section: "lm",
    sectionLabel: "Official Feature Films",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].film_id, "20120589");
  assert.equal(rows[0].title, "Arrugas");
  assert.deepEqual(rows[0].directors, ["Ignacio FERRERAS"]);
  assert.deepEqual(rows[0].countries, ["Spain"]);
  assert.equal(rows[1].title, "ParaNorman");
  assert.deepEqual(rows[1].directors, ["Sam FELL", "Chris BUTLER"]);
});

test("selectAnnecyFeatureSeedRows keeps runtime>=40 and dedupes", () => {
  const rows = selectAnnecyFeatureSeedRows([
    {
      title: "Flow",
      year: 2024,
      runtime_minutes: 85,
      directors: ["Gints Zilbalodis"],
      countries: ["Latvia"],
      festival_year: 2024,
      section: "lm",
    },
    {
      title: "Flow",
      year: 2024,
      runtime_minutes: 85,
      directors: ["Gints Zilbalodis"],
      countries: ["Latvia"],
      festival_year: 2025,
      section: "lm",
    },
    {
      title: "Too Short",
      year: 2024,
      runtime_minutes: 12,
      directors: ["X"],
      countries: ["France"],
      festival_year: 2024,
      section: "lm",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].festival_years, [2024, 2025]);
  assert.equal(ANNECY_FEATURE_MIN_RUNTIME_MINUTES, 40);
  assert.equal(
    buildAnnecyCombinedSeedBatch(rows, "annecy-test").films[0].title,
    "Flow"
  );
});
