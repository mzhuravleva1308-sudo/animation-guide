import test from "node:test";
import assert from "node:assert/strict";
import { buildFilmFestivalBadges } from "../festival-badge.ts";
import {
  applyFestivalPageAwardLabels,
  getFestivalPageAwardLabel,
  primaryAwardNote,
  shortFestivalAwardLabel,
} from "./festival-page-award-labels.mjs";

test("primaryAwardNote takes the first segment before ·", () => {
  assert.equal(
    primaryAwardNote(
      "Jury Award · Audience Award · Gan Foundation Award for Distribution"
    ),
    "Jury Award"
  );
  assert.equal(
    primaryAwardNote("Cristal for a Feature Film · Gan Foundation Award for Distribution"),
    "Cristal for a Feature Film"
  );
  assert.equal(primaryAwardNote("Jury Distinction"), "Jury Distinction");
  assert.equal(primaryAwardNote("  "), null);
  assert.equal(primaryAwardNote(null), null);
});

test("shortFestivalAwardLabel maps long page notes", () => {
  assert.equal(shortFestivalAwardLabel("Cristal for a Feature Film"), "Cristal");
  assert.equal(shortFestivalAwardLabel("Paul Grimault Award"), "Paul Grimault");
  assert.equal(
    shortFestivalAwardLabel("Gan Foundation Award for Distribution"),
    "Gan Foundation"
  );
  assert.equal(
    shortFestivalAwardLabel("Grand Prize for Animated Feature"),
    "Grand Prize"
  );
  assert.equal(
    shortFestivalAwardLabel("Grand Prix — Best Feature Film"),
    "Grand Prix"
  );
  assert.equal(
    shortFestivalAwardLabel("Mr. M Audience Award for Best Feature Film"),
    "Audience Award"
  );
  assert.equal(
    shortFestivalAwardLabel("AniMovie Award — Best Animated Feature Film"),
    "AniMovie Award"
  );
  assert.equal(shortFestivalAwardLabel("Jury Award"), "Jury Award");
  assert.equal(
    shortFestivalAwardLabel("Contrechamp Grand Prix"),
    "Contrechamp Grand Prix"
  );
  assert.equal(
    shortFestivalAwardLabel(
      "Jury Award · Audience Award · Gan Foundation Award for Distribution"
    ),
    "Jury Award"
  );
});

test("getFestivalPageAwardLabel resolves published page titles only", () => {
  assert.equal(getFestivalPageAwardLabel("The Violinist", "annecy"), "Cristal");
  assert.equal(getFestivalPageAwardLabel("Flow", "annecy"), "Jury Award");
  assert.equal(
    getFestivalPageAwardLabel("My Love Affair with Marriage", "annecy"),
    "Jury Distinction"
  );
  assert.equal(
    getFestivalPageAwardLabel("We Are Aliens", "ottawa"),
    "Grand Prize"
  );
  assert.equal(
    getFestivalPageAwardLabel("Death Does Not Exist", "zagreb"),
    "Grand Prix"
  );
  assert.equal(
    getFestivalPageAwardLabel("A Story About Fire", "stuttgart"),
    "AniMovie Award"
  );
  assert.equal(getFestivalPageAwardLabel("Unknown Film", "annecy"), null);
  assert.equal(getFestivalPageAwardLabel("Flow", "cannes"), null);
});

test("applyFestivalPageAwardLabels composes festival · award", () => {
  const badges = applyFestivalPageAwardLabels(
    [
      { id: "annecy", label: "Annecy" },
      { id: "cannes", label: "Cannes" },
    ],
    "Memoir of a Snail"
  );

  assert.equal(badges[0]?.label, "Annecy · Cristal");
  assert.equal(badges[1]?.label, "Cannes");
});

test("Little Amélie gets Annecy and Stuttgart awards independently", () => {
  assert.equal(
    getFestivalPageAwardLabel(
      "Little Amélie or the Character of Rain",
      "annecy"
    ),
    "Audience Award"
  );
  assert.equal(
    getFestivalPageAwardLabel(
      "Little Amélie or the Character of Rain",
      "stuttgart"
    ),
    "Special Mention"
  );

  const badges = applyFestivalPageAwardLabels(
    [
      { id: "annecy", label: "Annecy" },
      { id: "stuttgart", label: "Stuttgart" },
    ],
    "Little Amélie or the Character of Rain"
  );

  assert.deepEqual(
    badges.map((badge) => badge.label),
    ["Annecy · Audience Award", "Stuttgart · Special Mention"]
  );
});

test("page awards apply after badge build on hit and skip miss", () => {
  const claim = {
    canonical_festival_id: "annecy",
    raw_festival_name: "Annecy",
  };

  const onPage = applyFestivalPageAwardLabels(
    buildFilmFestivalBadges({ claims: [claim] }),
    "Memoir of a Snail"
  );
  const offPage = applyFestivalPageAwardLabels(
    buildFilmFestivalBadges({ claims: [claim] }),
    "Some Other Film"
  );

  assert.equal(onPage[0]?.label, "Annecy · Cristal");
  assert.equal(offPage[0]?.label, "Annecy");
});
