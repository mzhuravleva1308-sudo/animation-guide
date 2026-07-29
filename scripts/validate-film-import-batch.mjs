import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = path.join(
  ROOT,
  "schemas",
  "film-import-batch.schema.json"
);

function parseArgs(argv) {
  const fileArg = argv.find(
    (arg) => arg === "--file" || arg.startsWith("--file=")
  );
  if (!fileArg) {
    throw new Error("Usage: node scripts/validate-film-import-batch.mjs --file <path>");
  }

  const file =
    fileArg === "--file"
      ? argv[argv.indexOf(fileArg) + 1]
      : fileArg.slice("--file=".length);
  if (!file) throw new Error("Missing value for --file");
  return file;
}

function pointerToPath(instancePath) {
  if (!instancePath) return "$";
  return instancePath
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((part) => (/^\d+$/.test(part) ? `[${part}]` : `.${part}`))
    .join("")
    .replace(/^\./, "");
}

function filmTitle(data, instancePath) {
  const match = instancePath?.match(/^\/films\/(\d+)/);
  const film = match ? data?.films?.[Number(match[1])] : null;
  return film?.title || `film #${match ? Number(match[1]) + 1 : "?"}`;
}

function normalize(value) {
  if (typeof value !== "string") return value;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function recognitionKey(recognition) {
  return [
    recognition.festival_name,
    recognition.festival_year,
    recognition.section,
    recognition.recognition_type,
    recognition.award_name,
    recognition.award_result,
    recognition.award_level,
    recognition.source_url,
  ]
    .map(normalize)
    .join("\u0000");
}

function duplicateErrors(data) {
  const errors = [];
  const filmKeys = new Map();

  for (const [filmIndex, film] of (data.films ?? []).entries()) {
    const filmKey = `${normalize(film.title)}\u0000${film.year}`;
    const previousFilmIndex = filmKeys.get(filmKey);
    if (previousFilmIndex !== undefined) {
      errors.push({
        instancePath: `/films/${filmIndex}/title`,
        message: `duplicate film title + year; first appears at films[${previousFilmIndex}]`,
      });
    } else {
      filmKeys.set(filmKey, filmIndex);
    }

    for (const field of ["countries", "directors", "technique"]) {
      const values = new Map();
      for (const [valueIndex, value] of (film[field] ?? []).entries()) {
        const key = normalize(value);
        const previousValueIndex = values.get(key);
        if (previousValueIndex !== undefined) {
          errors.push({
            instancePath: `/films/${filmIndex}/${field}/${valueIndex}`,
            message: `duplicate ${field} value; first appears at ${field}[${previousValueIndex}]`,
          });
        } else {
          values.set(key, valueIndex);
        }
      }
    }

    const recognitionKeys = new Map();
    for (const [recognitionIndex, recognition] of (
      film.festival_recognitions ?? []
    ).entries()) {
      const key = recognitionKey(recognition);
      const previousRecognitionIndex = recognitionKeys.get(key);
      if (previousRecognitionIndex !== undefined) {
        errors.push({
          instancePath: `/films/${filmIndex}/festival_recognitions/${recognitionIndex}`,
          message: `duplicate festival recognition; first appears at festival_recognitions[${previousRecognitionIndex}]`,
        });
      } else {
        recognitionKeys.set(key, recognitionIndex);
      }
    }
  }

  return errors;
}

/**
 * Legacy batches may omit quick_filters. Default to [] with a warning so
 * validation/import can proceed without treating omission as an error.
 * Mutates film objects in place.
 */
export function applyLegacyQuickFiltersDefaults(data) {
  const warnings = [];

  for (const [filmIndex, film] of (data?.films ?? []).entries()) {
    if (!film || typeof film !== "object" || Array.isArray(film)) continue;
    if (Object.prototype.hasOwnProperty.call(film, "quick_filters")) continue;

    film.quick_filters = [];
    warnings.push({
      instancePath: `/films/${filmIndex}/quick_filters`,
      message:
        "missing quick_filters; defaulting to [] for legacy batch compatibility",
      keyword: "legacyQuickFilters",
    });
  }

  return warnings;
}

/**
 * Soft warnings for legacy batches that omit catalog_visible.
 * Missing field defaults to true at import time and is not a schema error.
 */
export function collectCatalogVisibleWarnings(data) {
  const warnings = [];

  for (const [filmIndex, film] of (data?.films ?? []).entries()) {
    if (!film || typeof film !== "object" || Array.isArray(film)) continue;
    if (Object.prototype.hasOwnProperty.call(film, "catalog_visible")) continue;

    warnings.push({
      instancePath: `/films/${filmIndex}/catalog_visible`,
      message:
        "catalog_visible omitted; defaulting to true for public catalog visibility",
      keyword: "legacyCatalogVisible",
    });
  }

  return warnings;
}

export function validateFilmImportBatch(data, schema) {
  const warnings = [
    ...applyLegacyQuickFiltersDefaults(data),
    ...collectCatalogVisibleWarnings(data),
  ];
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const validAgainstSchema = validate(data);
  const schemaErrors = validAgainstSchema ? [] : validate.errors ?? [];
  return {
    errors: [...schemaErrors, ...duplicateErrors(data)],
    warnings,
  };
}

export function formatValidationErrors(errors, data) {
  return errors.map((error) => {
    let errorPath = error.instancePath;
    if (error.keyword === "required" && error.params?.missingProperty) {
      errorPath += `/${error.params.missingProperty}`;
    }
    if (
      error.keyword === "additionalProperties" &&
      error.params?.additionalProperty
    ) {
      errorPath += `/${error.params.additionalProperty}`;
    }
    const exactPath = pointerToPath(errorPath);
    const prefix =
      error.keyword === "legacyQuickFilters" ||
      error.keyword === "legacyCatalogVisible"
        ? "Warning"
        : "Film";
    return `${prefix} "${filmTitle(data, error.instancePath)}": ${exactPath} — ${error.message}`;
  });
}

export async function validateFile(filePath) {
  let data;
  let schema;

  try {
    data = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
  } catch (error) {
    throw new Error(`Could not read valid JSON from ${filePath}: ${error.message}`);
  }

  try {
    schema = JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Could not read batch schema: ${error.message}`);
  }

  const { errors, warnings } = validateFilmImportBatch(data, schema);
  return {
    data,
    errors,
    warnings,
    messages: formatValidationErrors(errors, data),
    warningMessages: formatValidationErrors(warnings, data),
  };
}

async function main() {
  const filePath = parseArgs(process.argv.slice(2));
  const result = await validateFile(filePath);

  for (const message of result.warningMessages) {
    console.warn(`- ${message}`);
  }

  if (result.errors.length) {
    console.error(`Invalid film import batch: ${filePath}`);
    for (const message of result.messages) console.error(`- ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Valid film import batch: ${filePath}`);
  console.log(`Films: ${result.data.films.length}`);
  if (result.warnings.length) {
    console.log(`Warnings: ${result.warnings.length}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Film import batch validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
