import assert from "node:assert/strict";
import test from "node:test";
import { goLiveFilmBatch } from "./film-release-go-live.mjs";

const SUPABASE_URL = "https://example.supabase.co";
const filmId = "78a124c0-3523-49e5-8c6f-6b37feacc307";
const posterUrl = `${SUPABASE_URL}/storage/v1/object/public/film-posters/${filmId}.jpg`;

function makeFakeSupabase(filmOverrides = {}) {
  const film = {
    id: filmId,
    title: "Ready Film",
    year: 2024,
    catalog_visible: false,
    poster_url: posterUrl,
    moods: ["tender"],
    aesthetic_tags: ["handmade"],
    synopsis: "S",
    the_mood: "M",
    technique: "2D",
    ...filmOverrides,
  };

  const state = {
    films: [film],
    moodEmb: [{ film_id: filmId }],
    aestheticEmb: [{ film_id: filmId }],
    queue: [
      {
        id: "queue-1",
        film_id: filmId,
        result_checklist: { profile_scores: "deferred" },
        discovery_candidate_id: "cand-1",
      },
    ],
    candidates: [{ id: "cand-1" }],
    batches: [],
    queueUpdates: [],
    candidateUpdates: [],
  };

  return {
    state,
    client: {
      from(table) {
        const api = {
          select() {
            return api;
          },
          in() {
            return api;
          },
          eq() {
            return api;
          },
          update(payload) {
            api._update = payload;
            const finish = () => {
              if (table === "films" && payload.catalog_visible === true) {
                state.films[0].catalog_visible = true;
              }
              if (table === "film_import_queue") {
                state.queueUpdates.push(payload);
              }
              if (table === "film_discovery_candidates") {
                state.candidateUpdates.push(payload);
              }
              if (table === "film_release_batches") {
                Object.assign(state.batches[0] ?? {}, payload);
              }
              return Promise.resolve({ error: null });
            };
            return {
              in() {
                return {
                  eq() {
                    return finish();
                  },
                  then(resolve) {
                    return finish().then(resolve);
                  },
                };
              },
              eq() {
                return finish();
              },
            };
          },
          insert(row) {
            const inserted = {
              id: "batch-1",
              created_at: "2026-08-15T00:00:00.000Z",
              ...row,
            };
            state.batches.push(inserted);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: inserted, error: null });
                  },
                };
              },
            };
          },
          then(resolve) {
            let data = null;
            if (table === "films") data = state.films;
            if (table === "film_mood_embeddings") data = state.moodEmb;
            if (table === "film_aesthetic_embeddings") data = state.aestheticEmb;
            if (table === "film_import_queue") data = state.queue;
            if (table === "film_discovery_candidates") data = state.candidates;
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return api;
      },
    },
  };
}

test("goLiveFilmBatch scores only the released film ids", async () => {
  const fake = makeFakeSupabase();
  /** @type {string[] | null} */
  let scoredIds = null;
  const result = await goLiveFilmBatch(fake.client, [filmId], {
    supabaseUrl: SUPABASE_URL,
    scoreFilms: async (ids) => {
      scoredIds = ids;
      return { profileCount: 3, rowCount: 3, emptyProfiles: 0 };
    },
  });

  assert.deepEqual(scoredIds, [filmId]);
  assert.equal(result.revealedCount, 1);
  assert.equal(result.profileJobs, 0);
  assert.equal(result.incrementalScores.rowCount, 3);
  assert.equal(fake.state.films[0].catalog_visible, true);
  assert.equal(fake.state.queueUpdates[0].result_checklist.profile_scores, "done");
});
