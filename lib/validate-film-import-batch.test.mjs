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
    ...overrides,
  };
}

function validBatch(films = [validFilm()]) {
  return { batch_name: "test-batch", films };
}

function messagesFor(data) {
  return formatValidationErrors(validateFilmImportBatch(data, schema), data);
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
