import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPublicCatalogVisibilityFilter,
  filterPublicCatalogFilms,
  isPublicCatalogFilm,
  resolveCatalogVisibleForImport,
} from "./public-catalog-films.mjs";
import { findFilmDuplicates } from "./film-duplicate-check.mjs";
import { fetchDuplicateCandidates } from "./insert-film.mjs";
import { searchFilms } from "./film-search.mjs";
import { buildFilmInsertPayload } from "../scripts/process-film-batch.mjs";
import {
  collectCatalogVisibleWarnings,
  validateFilmImportBatch,
} from "../scripts/validate-film-import-batch.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  await fs.readFile(
    path.join(root, "schemas", "film-import-batch.schema.json"),
    "utf8"
  )
);

const visibleFilm = {
  id: "visible-1",
  title: "Visible Film",
  year: 2026,
  catalog_visible: true,
  quick_filters: ["sci-fi"],
};

const hiddenFilm = {
  id: "hidden-1",
  title: "Tana",
  original_title: "Tana",
  year: 2026,
  director: "Ji Zhao",
  catalog_visible: false,
  quick_filters: ["sci-fi"],
};

function createQuerySpy() {
  const calls = [];
  const query = {
    eq(column, value) {
      calls.push({ column, value });
      return query;
    },
  };
  return { query, calls };
}

function filterSciFiQuick(films) {
  return films.filter((film) => film.quick_filters?.includes("sci-fi"));
}

function filterRecentQuick(films, currentYear = new Date().getFullYear()) {
  const recentYearFrom = currentYear - 2;
  return films.filter(
    (film) =>
      typeof film.year === "number" &&
      film.year >= recentYearFrom &&
      film.year <= currentYear
  );
}

test("visible film remains in public catalog filter", () => {
  const films = filterPublicCatalogFilms([visibleFilm, hiddenFilm]);
  assert.deepEqual(
    films.map((film) => film.id),
    ["visible-1"]
  );
  assert.equal(isPublicCatalogFilm(visibleFilm), true);
});

test("hidden film is absent from /films-style catalog list", () => {
  const catalog = filterPublicCatalogFilms([visibleFilm, hiddenFilm]);
  assert.equal(
    catalog.some((film) => film.id === hiddenFilm.id),
    false
  );
});

test("hidden film is absent from search results over public catalog", () => {
  const catalog = filterPublicCatalogFilms([visibleFilm, hiddenFilm]);
  const results = searchFilms(catalog, "Tana", { limit: 10 });
  assert.equal(results.length, 0);
});

test("hidden film is absent from profile catalog and quick filters", () => {
  const profileCatalog = filterPublicCatalogFilms([visibleFilm, hiddenFilm]);
  assert.equal(profileCatalog.some((film) => film.id === "hidden-1"), false);

  const recent = filterRecentQuick(profileCatalog);
  const sciFi = filterSciFiQuick(profileCatalog);

  assert.equal(recent.some((film) => film.id === "hidden-1"), false);
  assert.equal(sciFi.some((film) => film.id === "hidden-1"), false);
  assert.equal(sciFi.some((film) => film.id === "visible-1"), true);
});

test("public query helper applies catalog_visible = true", () => {
  const { query, calls } = createQuerySpy();
  applyPublicCatalogVisibilityFilter(query);
  assert.deepEqual(calls, [{ column: "catalog_visible", value: true }]);
});

test("hidden film is still found by service duplicate-check", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "films");
      return {
        select() {
          return {
            async in() {
              return { data: [hiddenFilm], error: null };
            },
          };
        },
      };
    },
  };

  const candidates = await fetchDuplicateCandidates(supabase, {
    title: "Tana",
    year: 2026,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, "hidden-1");

  const matches = findFilmDuplicates(
    { title: "Tana", year: 2026, director: "Ji Zhao" },
    candidates
  );
  assert.ok(matches.length >= 1);
});

test("hidden film remains available for embeddings/profile scores and is not deleted", () => {
  // Service/admin loads do not apply the public visibility filter.
  const serviceFilms = [visibleFilm, hiddenFilm];
  assert.equal(serviceFilms.some((film) => film.id === "hidden-1"), true);
  assert.equal(isPublicCatalogFilm(hiddenFilm), false);
  assert.deepEqual(
    serviceFilms.map((film) => film.id),
    ["visible-1", "hidden-1"]
  );
});

test("legacy import without catalog_visible defaults to true", () => {
  assert.equal(resolveCatalogVisibleForImport({}), true);
  assert.equal(resolveCatalogVisibleForImport({ catalog_visible: false }), false);
  assert.equal(resolveCatalogVisibleForImport({ catalog_visible: true }), true);

  const payload = buildFilmInsertPayload({
    title: "Legacy Film",
    original_title: null,
    year: 2026,
    runtime_minutes: 80,
    countries: ["France"],
    directors: ["Director"],
    synopsis: "Synopsis",
    the_mood: "Mood",
    technique: ["2D animation"],
    festival_recognitions: [],
    source_urls: {
      official: "https://example.com",
      festival: null,
      tmdb: null,
      imdb: null,
    },
  });
  assert.equal(payload.catalog_visible, true);

  const warnings = collectCatalogVisibleWarnings({
    batch_name: "legacy",
    films: [
      {
        title: "Legacy Film",
        year: 2026,
      },
    ],
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /defaulting to true/i);

  const { errors } = validateFilmImportBatch(
    {
      batch_name: "legacy-ok",
      films: [
        {
          title: "Legacy Film",
          year: 2026,
          countries: ["France"],
          directors: ["Director"],
          synopsis: "Synopsis",
          the_mood: "Mood",
          technique: ["2D animation"],
          festival_recognitions: [],
          source_urls: {
            official: "https://example.com",
            festival: null,
            tmdb: null,
            imdb: null,
          },
          quick_filters: [],
        },
      ],
    },
    schema
  );
  assert.deepEqual(errors, []);
});
