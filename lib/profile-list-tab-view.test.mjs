import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveProfileListTabView } from "./profile-list-tab-view.mjs";

describe("resolveProfileListTabView", () => {
  it("shows loading (not empty) while ratings/lists are still initializing", () => {
    assert.equal(
      resolveProfileListTabView({
        listsReady: false,
        listLength: 0,
      }),
      "loading"
    );
  });

  it("shows empty only after lists are ready and the list is confirmed empty", () => {
    assert.equal(
      resolveProfileListTabView({
        listsReady: true,
        listLength: 0,
      }),
      "empty"
    );
  });

  it("shows list when a pending guest rating has already populated filmRatings", () => {
    assert.equal(
      resolveProfileListTabView({
        listsReady: false,
        listLength: 1,
      }),
      "list"
    );
    assert.equal(
      resolveProfileListTabView({
        listsReady: true,
        listLength: 1,
      }),
      "list"
    );
  });

  it("treats Saved the same as Watched via shared listsReady lifecycle", () => {
    assert.equal(
      resolveProfileListTabView({
        listsReady: false,
        listLength: 0,
      }),
      "loading"
    );
    assert.equal(
      resolveProfileListTabView({
        listsReady: true,
        listLength: 0,
      }),
      "empty"
    );
    assert.equal(
      resolveProfileListTabView({
        listsReady: false,
        listLength: 2,
      }),
      "list"
    );
  });

  it("prefers error over loading/empty/list", () => {
    assert.equal(
      resolveProfileListTabView({
        loadError: "boom",
        listsReady: false,
        listLength: 0,
      }),
      "error"
    );
    assert.equal(
      resolveProfileListTabView({
        loadError: "boom",
        listsReady: true,
        listLength: 3,
      }),
      "error"
    );
  });

  it("does not conflate loading and empty into one state", () => {
    const loading = resolveProfileListTabView({
      listsReady: false,
      listLength: 0,
    });
    const empty = resolveProfileListTabView({
      listsReady: true,
      listLength: 0,
    });
    assert.notEqual(loading, empty);
    assert.equal(loading, "loading");
    assert.equal(empty, "empty");
  });
});
