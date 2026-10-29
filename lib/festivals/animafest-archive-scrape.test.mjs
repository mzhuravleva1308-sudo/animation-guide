import assert from "node:assert/strict";
import test from "node:test";
import {
  ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES,
  buildAnimafestSeedBatch,
  isAnimafestFeatureFilm,
  isAnimafestNotFoundPage,
  parseAnimafestFilmDetailPage,
  parseAnimafestFilmsListPage,
  parseAnimafestLiveFilmDetailPage,
  parseAnimafestLiveFilmsListPage,
  parseAnimafestRuntimeClock,
  selectAnimafestFeatureSeedRows,
  splitAnimafestTitleLine,
  toDiscoveryMinimalFilm,
} from "./animafest-archive-scrape.mjs";

const LIST_HTML = `
<a href="../film/read_all/logorama.html">en</a>
<a href="../film/read_all/my_dog_tulip.html">My Dog Tulip</a>
<a href="../film/read_all/my_dog_tulip.html">My Dog Tulip</a>
<a href="../film/read_all/a_cat_in_paris.html">A Cat in Paris</a>
`;

const DETAIL_HTML = `
<p class="t-14 t-lcase t-smallcaps t-bld lh-16">My Dog Tulip / My Dog Tulip</p>
<br />
<p class="t-14 t-lcase t-smallcaps t-bld">Paul Fierlinger</p>
    United States / 2009 / 83' 0''
<p class="t-14 t-lcase t-smallcaps "><a href="../../program/grand_competition_3/1.html">GRAND COMPETITION</a></p>
<p class="t-14 t-lcase t-smallcaps t-bld">Director</p><p>Paul Fierlinger</p><br />
<p class="t-14 t-lcase t-smallcaps t-bld lh-16">Synopsis</p>
<p>A middle-aged man adopts an Alsatian.</p>
`;

const ILLUSIONIST_HTML = `
<p class="t-14 t-lcase t-smallcaps t-bld lh-16">L'illusionniste / The Illusionist</p>
<br />
<p class="t-14 t-lcase t-smallcaps t-bld">Sylvain Chomet</p>
    France, United Kingdom / 2010 / 82' 0''
<p class="t-14 t-lcase t-smallcaps t-bld">Director</p><p>Sylvain Chomet</p>
`;

test("parse films list skips language chrome and dedupes slugs", () => {
  const rows = parseAnimafestFilmsListPage(LIST_HTML);
  assert.deepEqual(rows, [
    { slug: "my_dog_tulip", listTitle: "My Dog Tulip" },
    { slug: "a_cat_in_paris", listTitle: "A Cat in Paris" },
  ]);
});

test("split title line keeps list English title and original when different", () => {
  assert.deepEqual(
    splitAnimafestTitleLine("L'illusionniste / The Illusionist", "The Illusionist"),
    { title: "The Illusionist", original_title: "L'illusionniste" }
  );
  assert.deepEqual(
    splitAnimafestTitleLine("My Dog Tulip / My Dog Tulip", "My Dog Tulip"),
    { title: "My Dog Tulip", original_title: null }
  );
});

test("parse detail page extracts identity fields", () => {
  const film = parseAnimafestFilmDetailPage(DETAIL_HTML, {
    festivalYear: 2011,
    slug: "my_dog_tulip",
    listTitle: "My Dog Tulip",
  });
  assert.equal(film.title, "My Dog Tulip");
  assert.equal(film.original_title, null);
  assert.equal(film.year, 2009);
  assert.equal(film.runtime_minutes, 83);
  assert.deepEqual(film.directors, ["Paul Fierlinger"]);
  assert.deepEqual(film.countries, ["United States"]);
  assert.equal(film.section, "GRAND COMPETITION");
  assert.match(film.source_url, /my_dog_tulip\.html$/);
  assert.equal(isAnimafestFeatureFilm(film), true);
});

test("parse detail keeps original title when bilingual", () => {
  const film = parseAnimafestFilmDetailPage(ILLUSIONIST_HTML, {
    festivalYear: 2011,
    slug: "the_illusionist",
    listTitle: "The Illusionist",
  });
  assert.equal(film.title, "The Illusionist");
  assert.equal(film.original_title, "L'illusionniste");
  assert.deepEqual(film.countries, ["France", "United Kingdom"]);
  assert.equal(film.runtime_minutes, 82);
});

test("feature filter uses discovery runtime floor", () => {
  assert.equal(ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES, 40);
  assert.equal(isAnimafestFeatureFilm({ runtime_minutes: 39 }), false);
  assert.equal(isAnimafestFeatureFilm({ runtime_minutes: 40 }), true);
});

test("select features dedupes across festival years", () => {
  const rows = selectAnimafestFeatureSeedRows([
    {
      festival_year: 2013,
      slug: "tulip_later",
      title: "My Dog Tulip",
      year: 2009,
      runtime_minutes: 83,
      directors: ["Paul Fierlinger"],
      countries: ["United States"],
      source_url: "https://example.com/later",
    },
    {
      festival_year: 2011,
      slug: "my_dog_tulip",
      title: "My Dog Tulip",
      year: 2009,
      runtime_minutes: 83,
      directors: ["Paul Fierlinger"],
      countries: ["United States"],
      source_url: "https://example.com/earlier",
    },
    {
      festival_year: 2011,
      slug: "shortie",
      title: "Shortie",
      year: 2010,
      runtime_minutes: 12,
      directors: ["A"],
      countries: ["France"],
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].festival_year, 2011);
  assert.deepEqual(rows[0].festival_years, [2011, 2013]);
  assert.match(rows[0].source_url, /earlier$/);
});

test("seed batch only includes films whose festival_year matches", () => {
  const features = selectAnimafestFeatureSeedRows([
    {
      festival_year: 2011,
      title: "My Dog Tulip",
      year: 2009,
      runtime_minutes: 83,
      directors: ["Paul Fierlinger"],
      countries: ["United States"],
    },
    {
      festival_year: 2013,
      title: "Metropia",
      year: 2009,
      runtime_minutes: 86,
      directors: ["Tarik Saleh"],
      countries: ["Sweden"],
    },
  ]);
  const batch = buildAnimafestSeedBatch(2011, features);
  assert.equal(batch.batch_name, "animafest-2011");
  assert.equal(batch.films.length, 1);
  assert.equal(batch.films[0].title, "My Dog Tulip");
  assert.equal(
    Object.prototype.hasOwnProperty.call(batch.films[0], "source_urls"),
    false
  );
  assert.equal(toDiscoveryMinimalFilm(features.find((f) => f.title === "My Dog Tulip")).year, 2009);
});

test("404 page detector", () => {
  assert.equal(
    isAnimafestNotFoundPage(
      '<link rel="canonical" href="https://www.animafest.hr/hr/404" />'
    ),
    true
  );
  assert.equal(isAnimafestNotFoundPage("<html>ok</html>"), false);
});

test("live runtime clock parses to minutes", () => {
  assert.equal(parseAnimafestRuntimeClock("01:15:00"), 75);
  assert.equal(parseAnimafestRuntimeClock("00:12:30"), 12);
  assert.equal(parseAnimafestRuntimeClock("bad"), null);
});

test("parse live films list and detail", () => {
  const list = parseAnimafestLiveFilmsListPage(`
    <a href="/en/filmovi/14226/death-does-not-exist">Death</a>
    <a href="/en/filmovi/14226/death-does-not-exist">Death</a>
    <a href="/en/filmovi/14161/samurai-ballerina-l-etoile-de-paris-en-fleur">Samurai</a>
  `);
  assert.deepEqual(list, [
    { id: "14226", slug: "death-does-not-exist" },
    { id: "14161", slug: "samurai-ballerina-l-etoile-de-paris-en-fleur" },
  ]);

  const film = parseAnimafestLiveFilmDetailPage(
    `
    <div class="page-header">
      <span>Félix Dufour-Laperrière</span>
    </div>
    <h1>Death Does Not Exist</h1>
    <div class="film-info">
      <p>Canada, France / 2025 / 01:15:00</p>
    </div>
    `,
    { festivalYear: 2026, id: "14226", slug: "death-does-not-exist" }
  );
  assert.equal(film.title, "Death Does Not Exist");
  assert.equal(film.year, 2025);
  assert.equal(film.runtime_minutes, 75);
  assert.deepEqual(film.directors, ["Félix Dufour-Laperrière"]);
  assert.deepEqual(film.countries, ["Canada", "France"]);
  assert.equal(isAnimafestFeatureFilm(film), true);
});
