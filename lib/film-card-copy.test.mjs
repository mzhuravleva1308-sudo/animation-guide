import test from "node:test";
import assert from "node:assert/strict";
import {
  getFilmCardMood,
  getFilmCardSynopsis,
} from "./film-card-copy.mjs";

test("film card shows synopsis before the mood note", () => {
  const film = {
    synopsis: "The ordinary synopsis.",
    what_it_is: "A different editorial note.",
    the_mood: "The separate mood note.",
  };

  assert.equal(getFilmCardSynopsis(film), "The ordinary synopsis.");
  assert.equal(getFilmCardMood(film), "The separate mood note.");
});

test("film card falls back to what_it_is when synopsis is absent", () => {
  assert.equal(
    getFilmCardSynopsis({
      synopsis: null,
      what_it_is: "The compatibility fallback.",
    }),
    "The compatibility fallback."
  );
});
