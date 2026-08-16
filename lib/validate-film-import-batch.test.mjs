import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  formatValidationErrors,
  validateFilmImportBatch,
  validateFile,
} from "../scripts/validate-film-import-batch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  await fs.readFile(
    path.join(root, "schemas", "film-import-batch.schema.json"),
    "utf8"
  )
);

function validFilm(overrides = {}) {
  return {
    title: "Film title",
    original_title: "Original title",
    year: 2026,
    runtime_minutes: 85,
    countries: ["France"],
    directors: ["Director"],
    synopsis: "Neutral synopsis.",
    the_mood: "A quiet felt experience.",
    technique: ["2D animation"],
    festival_recognitions: [
      {
        festival_name: "Annecy",
        festival_year: 2026,
        section: "Competition",
        recognition_type: "selection",
        award_name: null,
        award_result: null,
        award_level: null,
        source_url: "https://example.com/festival",
      },
    ],
    source_urls: {
      official: "https://example.com/film",
      festival: null,
      tmdb: null,
      imdb: null,
    },
    notes: null,
    quick_filters: [],
    catalog_visible: true,
    ...overrides,
  };
}

function validBatch(films = [validFilm()]) {
  return { batch_name: "test-batch", films };
}

function messagesFor(data) {
  const { errors } = validateFilmImportBatch(data, schema);
  return formatValidationErrors(errors, data);
}

function resultFor(data) {
  return validateFilmImportBatch(data, schema);
}

test("valid batch passes schema validation", async () => {
  const result = await validateFile(
    path.join(root, "examples", "film-import-batch.template.json")
  );
  assert.deepEqual(result.errors, []);
});

test("missing required film field is rejected with an exact path", () => {
  const film = validFilm();
  delete film.synopsis;
  const messages = messagesFor(validBatch([film]));
  assert.ok(messages.some((message) => message.includes("films[0].synopsis")));
  assert.ok(messages.some((message) => message.includes('Film "Film title"')));
});

test("empty countries array is rejected", () => {
  const messages = messagesFor(validBatch([validFilm({ countries: [] })]));
  assert.ok(messages.some((message) => message.includes("countries")));
});

test("unknown recognition type is rejected", () => {
  const messages = messagesFor(
    validBatch([
      validFilm({
        festival_recognitions: [
          {
            ...validFilm().festival_recognitions[0],
            recognition_type: "winner",
          },
        ],
      }),
    ])
  );
  assert.ok(messages.some((message) => message.includes("recognition_type")));
});

test("award without award_name is rejected", () => {
  const recognition = {
    ...validFilm().festival_recognitions[0],
    recognition_type: "award",
    award_name: null,
    award_result: "winner",
  };
  const messages = messagesFor(
    validBatch([validFilm({ festival_recognitions: [recognition] })])
  );
  assert.ok(messages.some((message) => message.includes("award_name")));
});

test("all source URLs set to null are rejected", () => {
  const messages = messagesFor(
    validBatch([
      validFilm({
        source_urls: {
          official: null,
          festival: null,
          tmdb: null,
          imdb: null,
        },
      }),
    ])
  );
  assert.ok(messages.some((message) => message.includes("source_urls")));
});

test("duplicate films by title and year are rejected", () => {
  const messages = messagesFor(validBatch([validFilm(), validFilm()]));
  assert.ok(messages.some((message) => message.includes("duplicate film title + year")));
  assert.ok(messages.some((message) => message.includes("films[1].title")));
});

test("duplicate festival recognitions are rejected", () => {
  const recognition = validFilm().festival_recognitions[0];
  const messages = messagesFor(
    validBatch([
      validFilm({
        festival_recognitions: [recognition, { ...recognition }],
      }),
    ])
  );
  assert.ok(
    messages.some((message) => message.includes("duplicate festival recognition"))
  );
});

test("service fields such as embeddings are rejected", () => {
  const messages = messagesFor(
    validBatch([validFilm({ embeddings: { mood: [] } })])
  );
  assert.ok(messages.some((message) => message.includes("embeddings")));
});

const QUICK_FILTER_CASES = [
  [],
  ["connection"],
  ["distance"],
  ["sci-fi"],
  ["sarcasm"],
  ["sci-fi", "connection"],
  ["sci-fi", "distance"],
  ["sarcasm", "distance"],
  ["sci-fi", "sarcasm", "distance"],
];

for (const quickFilters of QUICK_FILTER_CASES) {
  test(`quick_filters ${JSON.stringify(quickFilters)} is accepted`, () => {
    const { errors, warnings } = resultFor(
      validBatch([validFilm({ quick_filters: quickFilters })])
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });
}

test("duplicate quick_filters token is rejected", () => {
  const messages = messagesFor(
    validBatch([validFilm({ quick_filters: ["sci-fi", "sci-fi"] })])
  );
  assert.ok(messages.some((message) => message.includes("quick_filters")));
  assert.ok(
    messages.some(
      (message) =>
        message.includes("unique") || message.includes("must NOT have duplicate")
    )
  );
});

test("connection and distance together are rejected", () => {
  const messages = messagesFor(
    validBatch([validFilm({ quick_filters: ["connection", "distance"] })])
  );
  assert.ok(messages.some((message) => message.includes("quick_filters")));
});

test("legacy batch without quick_filters gets [] with warning", () => {
  const film = validFilm();
  delete film.quick_filters;
  const batch = validBatch([film]);
  const { errors, warnings } = resultFor(batch);
  assert.deepEqual(errors, []);
  assert.ok(
    warnings.some((warning) => /legacy batch compatibility/.test(warning.message))
  );
  assert.deepEqual(batch.films[0].quick_filters, []);
});

test("catalog_visible boolean is accepted and omission is a warning only", () => {
  const withField = resultFor(
    validBatch([validFilm({ catalog_visible: false })])
  );
  assert.deepEqual(withField.errors, []);
  assert.equal(
    withField.warnings.some((warning) =>
      /catalog_visible omitted/i.test(warning.message)
    ),
    false
  );

  const legacy = validFilm();
  delete legacy.catalog_visible;
  const result = resultFor(validBatch([legacy]));
  assert.deepEqual(result.errors, []);
  assert.ok(
    result.warnings.some((warning) => /defaulting to true/i.test(warning.message))
  );
});
