import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodePendingFilmActionFromCallback,
  encodePendingFilmActionForCallback,
} from "./pending-film-action-callback.mjs";
import { createPendingFilmAction } from "./pending-film-action-core.mjs";

describe("encodePendingFilmActionForCallback", () => {
  it("round-trips pending save actions through callback URLs", () => {
    const action = createPendingFilmAction({
      type: "save",
      filmId: "film-123",
      saved: true,
    });

    const encoded = encodePendingFilmActionForCallback(action);
    assert.equal(decodePendingFilmActionFromCallback(encoded)?.id, action.id);
  });
});
