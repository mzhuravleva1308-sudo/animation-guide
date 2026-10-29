import assert from "node:assert/strict";
import test from "node:test";
import {
  ITFS_FEATURE_MIN_RUNTIME_MINUTES,
  buildItfsSeedBatch,
  cleanItfsText,
  isItfsFeatureFilm,
  itfsLangfilmIndexUrl,
  mergeItfsListFallbacks,
  parseItfsFilmDetailPage,
  parseItfsFilmsListPage,
  parseItfsIndexMeta,
  parseItfsRuntime,
  selectItfsFeatureSeedRows,
  toDiscoveryMinimalFilm,
} from "./itfs-archive-scrape.mjs";

const LIST_HTML = `
<a href="https://itfs.de/en/film/allah-is-not-obliged-2/" class="filmindex-row film" data-id="15001">
  <div class="filmindex-row-titles">
    <span class="filmindex-row-title">Allah Is Not Obliged</span>
    <span class="filmindex-row-original">Allah N&#039;est Pas Obligé</span>
  </div>
  <div class="filmindex-row-meta">2025 · Zaven Najjar · Canada, France, Luxembourg, Belgium · 73&nbsp;min · French</div>
  <span class="filmindex-row-section">ITFS 2026</span>
</a>
<a href="https://itfs.de/en/film/acorns-adventure-2/" class="filmindex-row film" data-id="16815">
  <div class="filmindex-row-titles">
    <span class="filmindex-row-title">Acorn&#8217;s Adventure</span>
    <span class="filmindex-row-original">Acorn&#039;s Adventure</span>
  </div>
  <div class="filmindex-row-meta">Filip Mašek · Czech Republic, Germany · 20&nbsp;min · English</div>
  <span class="filmindex-row-section">ITFS 2026</span>
</a>
<a href="https://itfs.de/en/film/flow-2/" class="filmindex-row film" data-id="5400">
  <div class="filmindex-row-titles">
    <span class="filmindex-row-title">Flow</span>
  </div>
  <div class="filmindex-row-meta">2024 · Gints Zilbalodis · Latvia, Belgium, France · 85&nbsp;min</div>
  <span class="filmindex-row-section">ITFS 2025</span>
</a>
`;

const DETAIL_HTML = `
<h1>Allah Is Not Obliged</h1>
<p class="original-title">Allah N&#039;est Pas Obligé</p>
<div class="meta">
  <div class="length"><span>73 min</span></div>
</div>
<div class="text">
  <p>In search of his aunt, young Birahima must navigate the turmoil.</p>
</div>
<div class="meta">
  <div>
    <span class="label">Country:</span>
    <span>Canada, France, Luxembourg, Belgium</span>
  </div>
  <div>
    <span class="label">Year:</span>
    <span>2025</span>
  </div>
  <div>
    <span class="label">Typ:</span>
    <span>Feature Film</span>
  </div>
  <div class="credits-list">
    <div class="credits-grouped">
      <div class="credit-group director">
        <span class="credit-role">Director:</span>
        <span class="credit-names">Zaven Najjar</span>
      </div>
    </div>
  </div>
</div>
`;

test("langfilm index URL encodes both edition years", () => {
  const url = itfsLangfilmIndexUrl([2026, 2025]);
  assert.match(url, /edition%5B%5D=3736/);
  assert.match(url, /edition%5B%5D=197/);
  assert.match(url, /length%5B%5D=langfilm/);
});

test("parse runtime minutes and mm:ss clocks", () => {
  assert.equal(parseItfsRuntime("73 min"), 73);
  assert.equal(parseItfsRuntime("69:27 min"), 69);
  assert.equal(parseItfsRuntime("81:51 min"), 81);
  assert.equal(parseItfsRuntime("nope"), null);
});

test("parse index meta variants", () => {
  assert.deepEqual(
    parseItfsIndexMeta(
      "2025 · Zaven Najjar · Canada, France · 73 min · French"
    ),
    {
      year: 2025,
      directors: ["Zaven Najjar"],
      countries: ["Canada", "France"],
      runtime_minutes: 73,
    }
  );
  assert.deepEqual(parseItfsIndexMeta("25 min"), {
    year: null,
    directors: [],
    countries: [],
    runtime_minutes: 25,
  });
  assert.deepEqual(
    parseItfsIndexMeta("Kenya · 20 min · Swahili, English"),
    {
      year: null,
      directors: [],
      countries: ["Kenya"],
      runtime_minutes: 20,
    }
  );
});

test("parse films list extracts titles, editions, and meta", () => {
  const rows = parseItfsFilmsListPage(LIST_HTML);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].listTitle, "Allah Is Not Obliged");
  assert.equal(rows[0].originalTitle, "Allah N'est Pas Obligé");
  assert.equal(rows[0].festivalYear, 2026);
  assert.equal(rows[0].runtime_minutes, 73);
  assert.deepEqual(rows[0].directors, ["Zaven Najjar"]);
  assert.equal(rows[1].listTitle, "Acorn’s Adventure");
  assert.equal(rows[1].originalTitle, null); // same after normalize
  assert.equal(rows[1].runtime_minutes, 20);
  assert.equal(rows[2].festivalYear, 2025);
});

test("parse detail page extracts identity fields", () => {
  const film = parseItfsFilmDetailPage(DETAIL_HTML, {
    festivalYear: 2026,
    slug: "allah-is-not-obliged-2",
    id: "15001",
    listTitle: "Allah Is Not Obliged",
  });
  assert.equal(film.title, "Allah Is Not Obliged");
  assert.equal(film.original_title, "Allah N'est Pas Obligé");
  assert.equal(film.year, 2025);
  assert.equal(film.runtime_minutes, 73);
  assert.deepEqual(film.directors, ["Zaven Najjar"]);
  assert.deepEqual(film.countries, [
    "Canada",
    "France",
    "Luxembourg",
    "Belgium",
  ]);
  assert.equal(film.typ, "Feature Film");
  assert.equal(isItfsFeatureFilm(film), true);
  assert.equal(ITFS_FEATURE_MIN_RUNTIME_MINUTES, 40);
});

test("list fallbacks fill sparse detail rows", () => {
  const detail = parseItfsFilmDetailPage(
    `<h1>Elio</h1><div class="length"><span>98 min</span></div>
     <div class="meta"><div><span class="label">Year:</span><span>2025</span></div>
     <div class="credits-list"><div class="credit-group director"><span class="credit-names">Adrian Molina, Domee Shi</span></div></div></div>`,
    { festivalYear: 2026, slug: "elio-2" }
  );
  const merged = mergeItfsListFallbacks(detail, {
    countries: ["United States"],
    directors: [],
    year: null,
    runtime_minutes: 98,
  });
  assert.deepEqual(merged.countries, ["United States"]);
  assert.deepEqual(merged.directors, ["Adrian Molina", "Domee Shi"]);
});

test("feature seed dedupes across festival years and builds batches", () => {
  const rows = selectItfsFeatureSeedRows([
    {
      title: "Pelikan Blue",
      original_title: "Kék Pelikan",
      year: 2024,
      runtime_minutes: 80,
      directors: ["László Csáki"],
      countries: ["Hungary"],
      festival_year: 2026,
      slug: "pelikan-blue-4",
      source_url: "https://itfs.de/en/film/pelikan-blue-4/",
    },
    {
      title: "Pelikan Blue",
      original_title: "Kék Pelikan",
      year: 2024,
      runtime_minutes: 80,
      directors: ["László Csáki"],
      countries: ["Hungary"],
      festival_year: 2025,
      slug: "pelikan-blue-2",
      source_url: "https://itfs.de/en/film/pelikan-blue-2/",
    },
    {
      title: "Too Short",
      year: 2025,
      runtime_minutes: 20,
      directors: ["Someone"],
      countries: ["Germany"],
      festival_year: 2026,
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].festival_year, 2025);
  assert.deepEqual(rows[0].festival_years, [2025, 2026]);

  const batch = buildItfsSeedBatch(2025, rows);
  assert.equal(batch.batch_name, "itfs-2025");
  assert.deepEqual(batch.films, [
    toDiscoveryMinimalFilm(rows[0]),
  ]);
  assert.equal(buildItfsSeedBatch(2026, rows).films.length, 0);
});

test("cleanItfsText decodes entities", () => {
  assert.equal(cleanItfsText("Acorn&#8217;s"), "Acorn’s");
});
