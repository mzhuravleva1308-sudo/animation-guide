import test from "node:test";
import assert from "node:assert/strict";
import {
  isOiafFeatureAward,
  parseOiafArchiveTable,
  parseOiafDirectorCredit,
  selectOiafFeatureAwardRows,
  splitOiafTitle,
  buildOiafCombinedSeedBatch,
  toDiscoveryMinimalFilm,
  OIAF_FEATURE_MIN_RUNTIME_MINUTES,
} from "./oiaf-archive-scrape.mjs";

test("isOiafFeatureAward matches feature prizes only", () => {
  assert.equal(isOiafFeatureAward("Grand Prize for Animated Feature"), true);
  assert.equal(isOiafFeatureAward("Best Feature"), true);
  assert.equal(
    isOiafFeatureAward("Best Animated Feature - Honourable Mention"),
    true
  );
  assert.equal(isOiafFeatureAward("Grand Prize for Short Animation"), false);
  assert.equal(isOiafFeatureAward("Public Prize"), false);
});

test("splitOiafTitle extracts alternate titles", () => {
  assert.deepEqual(splitOiafTitle("Arrugas (Wrinkles)"), {
    title: "Arrugas",
    original_title: "Wrinkles",
  });
  assert.deepEqual(
    splitOiafTitle("YORUWA MIJIKASHI ARUKEYO OTOME (NIGHT IS SHORT, WALK ON GIRL)"),
    {
      title: "YORUWA MIJIKASHI ARUKEYO OTOME",
      original_title: "NIGHT IS SHORT, WALK ON GIRL",
    }
  );
  assert.deepEqual(splitOiafTitle("CAFARD,"), {
    title: "CAFARD",
    original_title: null,
  });
});

test("parseOiafDirectorCredit pulls countries out of credits", () => {
  assert.deepEqual(
    parseOiafDirectorCredit(
      "Emma de Swaef and Marc James Roels (Belgium, France, Netherlands)"
    ),
    {
      directors: ["Emma de Swaef", "Marc James Roels"],
      countries: ["Belgium", "France", "Netherlands"],
    }
  );
  assert.deepEqual(parseOiafDirectorCredit("Masaaki Yuasa, Japan"), {
    directors: ["Masaaki Yuasa"],
    countries: ["Japan"],
  });
  assert.deepEqual(
    parseOiafDirectorCredit("Max Andersson & Helena Ahonen"),
    {
      directors: ["Max Andersson", "Helena Ahonen"],
      countries: [],
    }
  );
});

test("parseOiafArchiveTable reads feature rows", () => {
  const html = `
    <table data-footable_id="244206" id="footable_244206">
      <tbody>
        <tr data-row_id="1">
          <td>Arrugas (Wrinkles)</td>
          <td>Best Animated Feature</td>
          <td>Ignacio Ferreras</td>
          <td>2012</td>
          <td></td><td></td><td></td><td></td>
        </tr>
        <tr data-row_id="2">
          <td>Night Bus</td>
          <td>Public Prize</td>
          <td>Joe Hsieh</td>
          <td>2021</td>
          <td></td><td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>`;
  const rows = parseOiafArchiveTable(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Arrugas");
  assert.equal(rows[0].original_title, "Wrinkles");
  assert.equal(rows[0].festival_year, 2012);

  const features = selectOiafFeatureAwardRows(rows, 2012, 2021);
  assert.equal(features.length, 1);
  assert.equal(features[0].title, "Arrugas");
});

test("seed batch maps discovery-minimal fields", () => {
  const batch = buildOiafCombinedSeedBatch(
    [
      {
        title: "Wrinkles",
        original_title: "Arrugas",
        year: 2011,
        directors: ["Ignacio Ferreras"],
        countries: ["Spain"],
        runtime_minutes: 89,
      },
    ],
    "oiaf-2012-2021"
  );
  assert.equal(batch.batch_name, "oiaf-2012-2021");
  assert.deepEqual(batch.films[0], toDiscoveryMinimalFilm(batch.films[0]));
  assert.equal(OIAF_FEATURE_MIN_RUNTIME_MINUTES, 40);
});
