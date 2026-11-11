import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAuthModalCopy,
  reasonFromPendingAction,
  toPendingFilmActionInput,
} from "./auth-modal-copy.mjs";

describe("getAuthModalCopy", () => {
  it("uses the film title for save and rating copy", () => {
    assert.deepEqual(getAuthModalCopy("save", "email", { filmTitle: "Flow" }), {
      title: "Save Flow for later",
      description:
        "Keep your indie and festival animation finds in one place. Sign in with the link we email you, and we'll add Flow to your watchlist.",
    });

    assert.deepEqual(
      getAuthModalCopy("rating", "email", { filmTitle: "Flow" }),
      {
        title: "Save your rating for Flow",
        description:
          "We'll show you more indie and festival animation like the films you rate highly. Enter your email for a sign-in link, and we'll save your rating when you sign in.",
      }
    );
  });

  it("falls back to this film when the title is missing", () => {
    assert.equal(
      getAuthModalCopy("save", "email").title,
      "Save this film for later"
    );
    assert.match(getAuthModalCopy("save", "email").description, /this film/);
  });

  it("returns vibe search copy", () => {
    const copy = getAuthModalCopy("vibe_search", "email");
    assert.equal(copy.title, "Find animation that fits your mood");
    assert.match(copy.description, /dreamlike world/);
  });

  it("uses inbox copy on the sent step for every reason", () => {
    for (const reason of [
      "login",
      "save",
      "rating",
      "saved_tab",
      "watched_tab",
      "vibe_search",
    ]) {
      assert.deepEqual(getAuthModalCopy(reason, "sent"), {
        title: "Check your inbox",
        description: null,
      });
    }
  });
});

describe("reasonFromPendingAction", () => {
  it("maps save and rating pending actions", () => {
    assert.equal(reasonFromPendingAction({ type: "save" }), "save");
    assert.equal(reasonFromPendingAction({ type: "rating" }), "rating");
  });
});

describe("toPendingFilmActionInput", () => {
  it("strips filmTitle before storing a pending action", () => {
    assert.deepEqual(
      toPendingFilmActionInput({
        type: "save",
        filmId: "film-1",
        saved: true,
        filmTitle: "Flow",
      }),
      { type: "save", filmId: "film-1", saved: true }
    );
    assert.deepEqual(
      toPendingFilmActionInput({
        type: "rating",
        filmId: "film-1",
        rating: 8,
        filmTitle: "Flow",
      }),
      { type: "rating", filmId: "film-1", rating: 8 }
    );
  });
});
