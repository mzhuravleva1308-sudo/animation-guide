import assert from "node:assert/strict";
import test from "node:test";
import { RESONALE_MAJOR_FESTIVALS } from "../resonale-major-festivals.mjs";
import {
  ANIMATION_FESTIVALS_2026,
  formatFestivalEditionDates,
  listAnimationFestivals2026,
} from "./animation-festivals-2026.mjs";

/** Inactive / no 2026 edition — keep off the year page. */
const EXCLUDED_FROM_2026 = new Set(["anima-mundi"]);

test("2026 editions cover active animation majors exactly once", () => {
  const animationIds = RESONALE_MAJOR_FESTIVALS.filter(
    (festival) =>
      festival.group === "animation" && !EXCLUDED_FROM_2026.has(festival.id)
  ).map((festival) => festival.id);
  const editionIds = ANIMATION_FESTIVALS_2026.map((row) => row.festivalId);

  assert.deepEqual([...editionIds].sort(), [...animationIds].sort());
  assert.equal(new Set(editionIds).size, editionIds.length);
  assert.equal(editionIds.includes("anima-mundi"), false);
});

test("dated editions have ISO dates and official urls", () => {
  for (const row of ANIMATION_FESTIVALS_2026) {
    assert.match(row.url, /^https:\/\//);
    assert.ok(row.description.length > 40);
    assert.match(row.startDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.match(row.endDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.startDate <= row.endDate);
  }
});

test("list keeps significance order (Annecy first, Kaboom last)", () => {
  const list = listAnimationFestivals2026();
  assert.deepEqual(
    list.map((row) => row.festivalId),
    [
      "annecy",
      "ottawa",
      "animafest-zagreb",
      "itfs-stuttgart",
      "hiroshima",
      "anima-brussels",
      "fantoche",
      "cinanima",
      "anifilm",
      "kaboom",
    ]
  );
});

test("formatFestivalEditionDates handles same month and cross-month", () => {
  assert.equal(
    formatFestivalEditionDates("2026-06-21", "2026-06-27"),
    "June 21–27, 2026"
  );
  assert.equal(
    formatFestivalEditionDates("2026-02-20", "2026-03-01"),
    "February 20 – March 1, 2026"
  );
  assert.equal(
    formatFestivalEditionDates(null, null, "No 2026 edition announced"),
    "No 2026 edition announced"
  );
});
