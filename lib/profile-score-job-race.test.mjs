import assert from "node:assert/strict";
import test from "node:test";

function claimJob(state) {
  assert.equal(state.job.status, "pending");
  state.job.status = "running";
  return {
    generation: state.job.generation,
    profileId: state.job.profileId,
  };
}

function enqueueRatingChange(state) {
  state.job.generation += 1;
  state.job.status = "pending";
  state.job.scheduledAt = "later";
}

function replaceScoresIfCurrent(state, job, nextScores, beforeCommit = () => {}) {
  if (
    state.job.profileId !== job.profileId ||
    state.job.generation !== job.generation ||
    state.job.status !== "running"
  ) {
    return false;
  }

  const stagedScores = [...nextScores];
  beforeCommit();

  if (
    state.job.profileId !== job.profileId ||
    state.job.generation !== job.generation ||
    state.job.status !== "running"
  ) {
    return false;
  }

  state.scores = stagedScores;
  state.job.status = "completed";
  return true;
}

test("stale worker cannot replace scores after a new rating", () => {
  const state = {
    job: {
      profileId: "profile-1",
      generation: 7,
      status: "pending",
      scheduledAt: "now",
    },
    scores: ["scores-from-generation-6"],
  };

  const workerA = claimJob(state);
  enqueueRatingChange(state);

  assert.equal(
    replaceScoresIfCurrent(state, workerA, ["stale-generation-7"]),
    false
  );
  assert.deepEqual(state.scores, ["scores-from-generation-6"]);
  assert.equal(state.job.generation, 8);
  assert.equal(state.job.status, "pending");

  const workerB = claimJob(state);
  assert.equal(
    replaceScoresIfCurrent(state, workerB, ["current-generation-8"]),
    true
  );
  assert.deepEqual(state.scores, ["current-generation-8"]);
  assert.equal(state.job.generation, 8);
  assert.equal(state.job.status, "completed");
});

test("generation change during score replacement rolls back the staged result", () => {
  const state = {
    job: {
      profileId: "profile-1",
      generation: 7,
      status: "running",
      scheduledAt: "now",
    },
    scores: ["scores-from-generation-6"],
  };
  const workerA = {
    profileId: state.job.profileId,
    generation: state.job.generation,
  };

  assert.equal(
    replaceScoresIfCurrent(
      state,
      workerA,
      ["stale-generation-7"],
      () => enqueueRatingChange(state)
    ),
    false
  );
  assert.deepEqual(state.scores, ["scores-from-generation-6"]);
  assert.equal(state.job.generation, 8);
  assert.equal(state.job.status, "pending");
});
