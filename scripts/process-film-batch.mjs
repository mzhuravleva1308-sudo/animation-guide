import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { buildVideoLanguageList } from "../lib/tmdb-film-matching.mjs";

applyAppEnv();

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const configuredEmbeddingDimensions = Number(
  process.env.OPENAI_EMBEDDING_DIMENSIONS
);
const EMBEDDING_DIMENSIONS =
  Number.isInteger(configuredEmbeddingDimensions) &&
  configuredEmbeddingDimensions > 0
    ? configuredEmbeddingDimensions
    : null;
const FILM_SELECT =
  "id,title,year,synopsis,the_mood,technique,moods,aesthetic_tags,image_url,poster_url,external_image_url,trailer_url";
const IMMUTABLE_FIELDS = [
  "synopsis",
  "the_mood",
  "technique",
  "image_url",
  "external_image_url",
  "poster_url",
  "trailer_url",
];

function parseArgs(argv) {
  const options = {
    filmIds: [],
    dryRun: false,
    execute: false,
    skipMedia: false,
    waitForJobs: false,
    rebuildAllProfiles: false,
    timeoutMs: 10 * 60 * 1000,
    pollMs: 5000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--film-ids" || arg === "--film-ids=") {
      const value = arg === "--film-ids" ? argv[++index] : "";
      if (!value) throw new Error("Missing value for --film-ids");
      options.filmIds.push(...value.split(",").map((id) => id.trim()).filter(Boolean));
    } else if (arg.startsWith("--film-ids=")) {
      options.filmIds.push(
        ...arg.slice("--film-ids=".length).split(",").map((id) => id.trim()).filter(Boolean)
      );
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") options.execute = true;
    else if (arg === "--skip-media") options.skipMedia = true;
    else if (arg === "--wait-for-jobs") options.waitForJobs = true;
    else if (arg === "--rebuild-all-profiles") options.rebuildAllProfiles = true;
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (arg === "--poll-ms") options.pollMs = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.dryRun === options.execute) {
    throw new Error("Pass exactly one of --dry-run or --execute");
  }
  if (!options.filmIds.length) throw new Error("Pass --film-ids <uuid,...>");
  if (new Set(options.filmIds).size !== options.filmIds.length) {
    throw new Error("Duplicate film UUIDs are not allowed");
  }
  for (const id of options.filmIds) {
    if (!UUID_RE.test(id)) throw new Error(`Invalid film UUID: ${id}`);
  }
  return options;
}

function nonEmpty(value) {
  return typeof value === "string" ? Boolean(value.trim()) : value != null;
}

function hasTags(value) {
  return Array.isArray(value) && value.some((tag) => String(tag).trim());
}

function parseEmbedding(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((item) => Number(item.trim()));
  }
}

function validEmbedding(value, expectedDimensions = EMBEDDING_DIMENSIONS) {
  const vector = parseEmbedding(value);
  return (
    Array.isArray(vector) &&
    vector.length > 0 &&
    vector.every(Number.isFinite) &&
    (expectedDimensions == null || vector.length === expectedDimensions)
  );
}

function stableValue(value) {
  return JSON.stringify(value ?? null);
}

function snapshotFilm(film) {
  return Object.fromEntries(
    IMMUTABLE_FIELDS
      .filter((field) => nonEmpty(film[field]))
      .map((field) => [field, stableValue(film[field])])
  );
}

function readiness(film, moodEmbedding, aestheticEmbedding) {
  const metadata = ["title", "year", "synopsis", "the_mood", "technique"].every(
    (field) => nonEmpty(film[field])
  );
  const moods = hasTags(film.moods);
  const aestheticTags = hasTags(film.aesthetic_tags);
  const image = nonEmpty(film.poster_url) || nonEmpty(film.image_url);
  const rankingReady = moods && aestheticTags && moodEmbedding && aestheticEmbedding;
  return {
    metadata,
    moods,
    aestheticTags,
    moodEmbedding,
    aestheticEmbedding,
    image,
    video: nonEmpty(film.trailer_url),
    rankingReady,
    catalogReady: rankingReady && metadata && image,
  };
}

function logFilm(stage, film, message) {
  console.log(`[${stage}] ${film.title} — ${message}`);
}

async function runScopedScript(script, filmIds, dryRun) {
  const args = ["--film-ids", filmIds.join(",")];
  if (dryRun) args.push("--dry-run");
  try {
    const result = await execFileAsync(process.execPath, [path.join(SCRIPT_DIR, script), ...args], {
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw new Error(`${script} failed: ${error.message}`);
  }
}

async function query(supabase, table, select, apply) {
  let request = supabase.from(table).select(select);
  if (apply) request = apply(request);
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

async function loadState(supabase, filmIds) {
  const films = await query(supabase, "films", FILM_SELECT, (q) =>
    q.in("id", filmIds)
  );
  if (films.length !== filmIds.length) {
    const found = new Set(films.map((film) => film.id));
    throw new Error(
      `Unknown film UUID(s): ${filmIds.filter((id) => !found.has(id)).join(", ")}`
    );
  }
  const [moodRows, aestheticRows, recognitions] = await Promise.all([
    query(supabase, "film_mood_embeddings", "film_id,embedding,mood_text", (q) =>
      q.in("film_id", filmIds)
    ),
    query(
      supabase,
      "film_aesthetic_embeddings",
      "film_id,embedding,aesthetic_text",
      (q) => q.in("film_id", filmIds)
    ),
    query(
      supabase,
      "film_festival_recognitions",
      "film_id,id,festival_name,festival_year,section,recognition_type,award_name,award_level,source_url,dedupe_key,updated_at",
      (q) => q.in("film_id", filmIds).order("id")
    ),
  ]);
  const moodById = new Map(moodRows.map((row) => [row.film_id, row]));
  const aestheticById = new Map(aestheticRows.map((row) => [row.film_id, row]));
  return {
    films: filmIds.map((id) => films.find((film) => film.id === id)),
    moodById,
    aestheticById,
    recognitions,
  };
}

async function readProfiles(supabase) {
  return query(supabase, "profiles", "id,slug,name", (q) => q.order("slug"));
}

async function enqueueProfiles(supabase, profiles) {
  const now = new Date().toISOString();
  const existing = await query(
    supabase,
    "profile_score_rebuild_jobs",
    "profile_id,generation",
    (q) => q.in("profile_id", profiles.map((profile) => profile.id))
  );
  const generationById = new Map(
    existing.map((job) => [job.profile_id, Number(job.generation) + 1])
  );
  const rows = profiles.map((profile) => ({
    profile_id: profile.id,
    scheduled_at: now,
    status: "pending",
    generation: generationById.get(profile.id) ?? 1,
    attempts: 0,
    locked_at: null,
    last_error: null,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("profile_score_rebuild_jobs")
    .upsert(rows, { onConflict: "profile_id" });
  if (error) throw error;
  return rows;
}

async function waitForJobs(supabase, jobs, options) {
  const deadline = Date.now() + options.timeoutMs;
  const ids = jobs.map((job) => job.profile_id);
  while (Date.now() < deadline) {
    const rows = await query(
      supabase,
      "profile_score_rebuild_jobs",
      "profile_id,generation,status,last_error,updated_at",
      (q) => q.in("profile_id", ids)
    );
    const byId = new Map(rows.map((row) => [row.profile_id, row]));
    const failed = jobs
      .map((job) => byId.get(job.profile_id))
      .filter((job) => job?.last_error);
    if (failed.length) {
      throw new Error(
        `Profile jobs failed: ${failed
          .map((job) => `${job.profile_id}: ${job.last_error}`)
          .join("; ")}`
      );
    }
    if (
      jobs.every((job) => {
        const current = byId.get(job.profile_id);
        return (
          current?.generation === job.generation &&
          current?.status === "completed"
        );
      })
    ) {
      return;
    }
    await options.sleep(options.pollMs);
  }
  throw new Error(`Timed out waiting for ${jobs.length} profile job(s)`);
}

async function verifyCoverage(supabase, profiles, filmIds) {
  const rows = await query(
    supabase,
    "profile_film_scores",
    "profile_id,film_id",
    (q) => q.in("profile_id", profiles.map((profile) => profile.id)).in("film_id", filmIds)
  );
  const existing = new Set(rows.map((row) => `${row.profile_id}:${row.film_id}`));
  const missing = [];
  for (const profile of profiles) {
    for (const filmId of filmIds) {
      if (!existing.has(`${profile.id}:${filmId}`)) {
        missing.push(`${profile.slug ?? profile.id}:${filmId}`);
      }
    }
  }
  if (missing.length) {
    throw new Error(`Missing profile × film score rows: ${missing.join(", ")}`);
  }
}

function printTable(films, states) {
  console.log(
    "\n| Film | metadata | moods | aesthetic tags | mood embedding | aesthetic embedding | image | video | ranking-ready | catalog-ready |"
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const film of films) {
    const state = states.get(film.id);
    console.log(
      `| ${film.title} | ${state.metadata ? "yes" : "no"} | ${
        state.moods ? "yes" : "no"
      } | ${state.aestheticTags ? "yes" : "no"} | ${
        state.moodEmbedding ? "yes" : "no"
      } | ${state.aestheticEmbedding ? "yes" : "no"} | ${
        state.image ? "yes" : "no"
      } | ${state.video ? "yes" : "no"} | ${
        state.rankingReady ? "yes" : "no"
      } | ${state.catalogReady ? "yes" : "no"} |`
    );
  }
}

export async function processFilmBatch({
  supabase,
  options,
  runScript = runScopedScript,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!supabase) throw new Error("supabase client is required");
  const { filmIds } = options;
  const initial = await loadState(supabase, filmIds);
  const snapshots = new Map(initial.films.map((film) => [film.id, snapshotFilm(film)]));
  const profiles = await readProfiles(supabase);
  const initialStates = new Map(
    initial.films.map((film) => [
      film.id,
      readiness(
        film,
        validEmbedding(initial.moodById.get(film.id)?.embedding),
        validEmbedding(initial.aestheticById.get(film.id)?.embedding)
      ),
    ])
  );

  for (const film of initial.films) {
    logFilm("preflight", film, `ranking=${initialStates.get(film.id).rankingReady ? "ready" : "not-ready"}`);
  }
  const metadataFailures = initial.films.filter(
    (film) => !initialStates.get(film.id).metadata
  );
  if (metadataFailures.length) {
    throw new Error(
      `Metadata readiness failed before OpenAI: ${metadataFailures
        .map((film) => film.title)
        .join(", ")}`
    );
  }

  const allInitiallyReady = initial.films.every(
    (film) => initialStates.get(film.id).rankingReady
  );
  if (allInitiallyReady && !options.rebuildAllProfiles) {
    console.log("Fully ranking-ready batch: no-op (use --rebuild-all-profiles to enqueue).");
    printTable(initial.films, initialStates);
    return { noOp: true, profiles };
  }

  const missingMoodTags = initial.films.filter((film) => !hasTags(film.moods));
  const missingAestheticTags = initial.films.filter(
    (film) => !hasTags(film.aesthetic_tags)
  );
  console.log(
    `Execution plan: enrichment calls=${missingMoodTags.length + missingAestheticTags.length}, embedding calls=${
      initial.films.filter((film) => !initialStates.get(film.id).moodEmbedding).length +
      initial.films.filter((film) => !initialStates.get(film.id).aestheticEmbedding).length
    }, profiles=${profiles.length}`
  );
  if (options.dryRun) {
    for (const film of initial.films) {
      logFilm("enrichment", film, `${hasTags(film.moods) ? "skip moods" : "would fill moods"}; ${hasTags(film.aesthetic_tags) ? "skip aesthetic tags" : "would fill aesthetic tags"}`);
      logFilm("embeddings", film, `${initialStates.get(film.id).moodEmbedding ? "skip mood" : "would create mood"}; ${initialStates.get(film.id).aestheticEmbedding ? "skip aesthetic" : "would create aesthetic"}`);
      logFilm("media", film, options.skipMedia ? "skipped (--skip-media)" : "would fill missing image/video");
    }
    console.log(`Profiles that would be enqueued: ${profiles.map((profile) => profile.slug ?? profile.id).join(", ")}`);
    printTable(initial.films, initialStates);
    return { dryRun: true, profiles };
  }

  try {
    if (missingMoodTags.length || missingAestheticTags.length) {
      if (missingMoodTags.length) {
        await runScript(
          "fill-emotional-tags.mjs",
          missingMoodTags.map((film) => film.id),
          false
        );
      }
      if (missingAestheticTags.length) {
        await runScript(
          "fill-aesthetic-tags.mjs",
          missingAestheticTags.map((film) => film.id),
          false
        );
      }
    }
    let current = await loadState(supabase, filmIds);
    for (const film of current.films) logFilm("enrichment", film, hasTags(film.moods) && hasTags(film.aesthetic_tags) ? "complete" : "incomplete");
    if (current.films.some((film) => !hasTags(film.moods) || !hasTags(film.aesthetic_tags))) {
      throw new Error("Enrichment did not make every film ranking-ready for tags");
    }
    const filmsMissingMoodEmbeddings = current.films.filter(
      (film) => !validEmbedding(current.moodById.get(film.id)?.embedding)
    );
    const filmsMissingAestheticEmbeddings = current.films.filter(
      (film) => !validEmbedding(current.aestheticById.get(film.id)?.embedding)
    );
    if (filmsMissingMoodEmbeddings.length) {
      await runScript(
        "fill-film-mood-embeddings.mjs",
        filmsMissingMoodEmbeddings.map((film) => film.id),
        false
      );
    }
    if (filmsMissingAestheticEmbeddings.length) {
      await runScript(
        "fill-film-aesthetic-embeddings.mjs",
        filmsMissingAestheticEmbeddings.map((film) => film.id),
        false
      );
    }
    current = await loadState(supabase, filmIds);
    const states = new Map(
      current.films.map((film) => [
        film.id,
        readiness(
          film,
          validEmbedding(current.moodById.get(film.id)?.embedding),
          validEmbedding(current.aestheticById.get(film.id)?.embedding)
        ),
      ])
    );
    for (const film of current.films) logFilm("embeddings", film, states.get(film.id).moodEmbedding && states.get(film.id).aestheticEmbedding ? "valid" : "invalid");
    if (options.skipMedia) {
      for (const film of current.films) logFilm("media", film, "skipped (--skip-media)");
    } else {
      const filmsMissingImages = current.films.filter(
        (film) => !nonEmpty(film.poster_url) && !nonEmpty(film.image_url)
      );
      const filmsMissingTrailers = current.films.filter(
        (film) => !nonEmpty(film.trailer_url)
      );
      if (filmsMissingImages.length) {
        await runScript(
          "fill-images.mjs",
          filmsMissingImages.map((film) => film.id),
          false
        );
      }
      if (filmsMissingTrailers.length) {
        await runScript(
          "fill-trailers.mjs",
          filmsMissingTrailers.map((film) => film.id),
          false
        );
      }
      current = await loadState(supabase, filmIds);
      for (const film of current.films) logFilm("media", film, `image=${nonEmpty(film.poster_url) || nonEmpty(film.image_url) ? "available" : "missing"}; video=${nonEmpty(film.trailer_url) ? "available" : "missing"}`);
    }
    const finalStates = new Map(
      current.films.map((film) => [
        film.id,
        readiness(
          film,
          validEmbedding(current.moodById.get(film.id)?.embedding),
          validEmbedding(current.aestheticById.get(film.id)?.embedding)
        ),
      ])
    );
    printTable(current.films, finalStates);
    const notReady = current.films.filter((film) => !finalStates.get(film.id).rankingReady);
    if (notReady.length) throw new Error(`Ranking readiness failed: ${notReady.map((film) => film.title).join(", ")}`);
    const immutableAfter = await loadState(supabase, filmIds);
    for (const film of immutableAfter.films) {
      if (stableValue(snapshots.get(film.id)) !== stableValue(snapshotFilm(film))) {
        throw new Error(`Immutable film fields changed: ${film.title}`);
      }
    }
    if (stableValue(initial.recognitions) !== stableValue(immutableAfter.recognitions)) {
      throw new Error("Festival recognitions changed unexpectedly");
    }
    const jobs = await enqueueProfiles(supabase, profiles);
    console.log(`Enqueued profiles: ${jobs.length}`);
    if (options.waitForJobs) {
      await waitForJobs(supabase, jobs, { ...options, sleep });
      await verifyCoverage(supabase, profiles, filmIds);
      console.log("Worker completion and profile × film coverage verified.");
    } else {
      console.log("Check jobs with: select * from profile_score_rebuild_jobs;");
    }
    for (const film of current.films) {
      logFilm("ranking-ready", film, "yes");
      logFilm("catalog-ready", film, finalStates.get(film.id).catalogReady ? "yes" : "no");
    }
    return { jobs, states: finalStates, profiles };
  } catch (error) {
    console.error("Batch stopped before enqueue:", error.message);
    throw error;
  }
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  if (options.dryRun) {
    console.log(`Dry-run embedding config: model=${EMBEDDING_MODEL}, dimensions=${EMBEDDING_DIMENSIONS ?? "provider response"}`);
  }
  await processFilmBatch({ supabase: createClient(url, key), options });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`process-film-batch failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  parseArgs,
  readiness,
  validEmbedding,
  buildVideoLanguageList,
};
