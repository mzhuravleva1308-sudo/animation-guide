import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "scripts",
  "fixtures",
  "backfill-sample-films.json"
);
const CONTROL_FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "scripts",
  "fixtures",
  "backfill-control-batch-films.json"
);

const ANNECY_FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "scripts",
  "fixtures",
  "backfill-annecy-films.json"
);

/**
 * @param {{ controlBatch?: boolean, annecyBatch?: boolean }} options
 */
export function loadFixtureFilmIds(options = {}) {
  const { controlBatch = false, annecyBatch = false } = options;
  const fixturePath = annecyBatch
    ? ANNECY_FIXTURE_PATH
    : controlBatch
      ? CONTROL_FIXTURE_PATH
      : SAMPLE_FIXTURE_PATH;
  const films = JSON.parse(readFileSync(fixturePath, "utf8"));
  return films.map((film) => film.id);
}
