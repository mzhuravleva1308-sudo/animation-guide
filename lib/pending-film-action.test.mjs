import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearPendingFilmAction,
  createPendingFilmAction,
  markPendingFilmActionApplied,
  parsePendingFilmAction,
  readAppliedPendingFilmActionId,
  readPendingFilmAction,
  shouldApplyPendingFilmAction,
  storePendingFilmAction,
} from "./pending-film-action-core.mjs";

function createMemoryStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe("createPendingFilmAction", () => {
  it("assigns a unique id to save actions", () => {
    const action = createPendingFilmAction({
      type: "save",
      filmId: "film-1",
      saved: true,
    });

    assert.equal(action.type, "save");
    assert.equal(action.filmId, "film-1");
    assert.equal(action.saved, true);
    assert.match(action.id, /^pending-/);
  });

  it("assigns a unique id to rating actions", () => {
    const action = createPendingFilmAction({
      type: "rating",
      filmId: "film-2",
      rating: 8,
    });

    assert.equal(action.rating, 8);
    assert.match(action.id, /^pending-/);
  });
});

describe("parsePendingFilmAction", () => {
  it("accepts valid save and rating payloads", () => {
    assert.deepEqual(
      parsePendingFilmAction({
        id: "pending-1",
        type: "save",
        filmId: "film-1",
        saved: false,
      }),
      {
        id: "pending-1",
        type: "save",
        filmId: "film-1",
        saved: false,
      }
    );

    assert.deepEqual(
      parsePendingFilmAction({
        id: "pending-2",
        type: "rating",
        filmId: "film-2",
        rating: null,
      }),
      {
        id: "pending-2",
        type: "rating",
        filmId: "film-2",
        rating: null,
      }
    );
  });

  it("rejects malformed payloads", () => {
    assert.equal(parsePendingFilmAction(null), null);
    assert.equal(parsePendingFilmAction({ type: "save" }), null);
    assert.equal(
      parsePendingFilmAction({
        id: "pending-3",
        type: "rating",
        filmId: "film-3",
        rating: 11,
      }),
      null
    );
  });
});

describe("pending film action storage", () => {
  it("stores, replaces, and clears pending actions", () => {
    const storage = createMemoryStorage();
    const first = createPendingFilmAction({
      type: "save",
      filmId: "film-1",
      saved: true,
    });
    const second = createPendingFilmAction({
      type: "rating",
      filmId: "film-1",
      rating: 7,
    });

    storePendingFilmAction(storage, first);
    assert.deepEqual(readPendingFilmAction(storage), first);

    storePendingFilmAction(storage, second);
    assert.deepEqual(readPendingFilmAction(storage), second);

    clearPendingFilmAction(storage);
    assert.equal(readPendingFilmAction(storage), null);
  });

  it("tracks applied ids and clears pending state after apply", () => {
    const storage = createMemoryStorage();
    const action = createPendingFilmAction({
      type: "save",
      filmId: "film-1",
      saved: true,
    });

    storePendingFilmAction(storage, action);
    assert.equal(shouldApplyPendingFilmAction(storage, action), true);

    markPendingFilmActionApplied(storage, action.id);

    assert.equal(readPendingFilmAction(storage), null);
    assert.equal(readAppliedPendingFilmActionId(storage), action.id);
    assert.equal(shouldApplyPendingFilmAction(storage, action), false);
  });

  it("allows only the latest pending action to be applied once", () => {
    const storage = createMemoryStorage();
    const first = createPendingFilmAction({
      type: "save",
      filmId: "film-1",
      saved: true,
    });
    const second = createPendingFilmAction({
      type: "rating",
      filmId: "film-1",
      rating: 9,
    });

    storePendingFilmAction(storage, first);
    markPendingFilmActionApplied(storage, first.id);

    storePendingFilmAction(storage, second);
    assert.equal(shouldApplyPendingFilmAction(storage, second), true);

    markPendingFilmActionApplied(storage, second.id);
    assert.equal(shouldApplyPendingFilmAction(storage, second), false);
  });
});
