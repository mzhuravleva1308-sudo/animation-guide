import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFilmFestivalBadges,
  resolveFestivalBadgeId,
} from "./festival-badge.ts";

test("resolveFestivalBadgeId maps canonical ids and aliases", () => {
  assert.equal(resolveFestivalBadgeId("annecy"), "annecy");
  assert.equal(resolveFestivalBadgeId("ottawa"), "ottawa");
  assert.equal(
    resolveFestivalBadgeId("Ottawa International Animation Festival"),
    "ottawa"
  );
  assert.equal(resolveFestivalBadgeId("Toronto International Film Festival"), "tiff");
  assert.equal(resolveFestivalBadgeId("Tokyo Anime Award Festival"), "tokyo_anime");
  assert.equal(resolveFestivalBadgeId("Venice"), "venice");
  assert.equal(resolveFestivalBadgeId("bfi-london"), "bfi_london");
  assert.equal(resolveFestivalBadgeId("san-sebastian"), "san_sebastian");
  assert.equal(resolveFestivalBadgeId("Locarno Film Festival"), "locarno");
});

test("buildFilmFestivalBadges dedupes claims and catalog festival field", () => {
  const badges = buildFilmFestivalBadges({
    catalogFestival: "Cannes Film Festival",
    claims: [
      { canonical_festival_id: "annecy", raw_festival_name: "Annecy" },
      { canonical_festival_id: "annecy", raw_festival_name: "Annecy International Animation Film Festival" },
      { canonical_festival_id: "cannes", raw_festival_name: "Cannes" },
    ],
  });

  assert.deepEqual(
    badges.map((badge) => badge.id),
    ["annecy", "cannes"]
  );
  assert.equal(badges[0]?.color, "#2457A6");
  assert.equal(badges[0]?.backgroundColor, "#EAF0FB");
  assert.equal(badges[0]?.fullName, "Annecy International Animation Film Festival");
  assert.match(badges[0]?.description ?? "", /animation festival/i);
});

test("manual Annecy recognitions create one badge for selection and award rows", () => {
  const manualRecognitions = [
    {
      canonical_festival_id: "annecy",
      raw_festival_name: "Annecy International Animation Film Festival",
    },
    {
      canonical_festival_id: "annecy",
      raw_festival_name: "Annecy International Animation Film Festival",
    },
  ];
  const badges = buildFilmFestivalBadges({
    claims: manualRecognitions,
  });

  assert.deepEqual(
    badges.map((badge) => badge.id),
    ["annecy"]
  );
});

test("Ottawa recognitions create an Ottawa badge after Annecy", () => {
  const badges = buildFilmFestivalBadges({
    claims: [
      {
        canonical_festival_id: "annecy",
        raw_festival_name: "Annecy International Animation Film Festival",
      },
      {
        canonical_festival_id: "ottawa",
        raw_festival_name: "Ottawa International Animation Festival",
      },
    ],
  });

  assert.deepEqual(
    badges.map((badge) => badge.id),
    ["annecy", "ottawa"]
  );
  assert.equal(badges[1]?.label, "Ottawa");
  assert.equal(badges[1]?.color, "#A31F34");
});

test("Zagreb recognitions resolve from Animafest name and canonical id", () => {
  assert.equal(resolveFestivalBadgeId("animafest-zagreb"), "zagreb");
  assert.equal(resolveFestivalBadgeId("Animafest Zagreb"), "zagreb");

  const badges = buildFilmFestivalBadges({
    claims: [
      {
        canonical_festival_id: "annecy",
        raw_festival_name: "Annecy International Animation Film Festival",
      },
      {
        canonical_festival_id: "animafest-zagreb",
        raw_festival_name: "Animafest Zagreb",
      },
    ],
  });

  assert.deepEqual(
    badges.map((badge) => badge.id),
    ["annecy", "zagreb"]
  );
  assert.equal(badges[1]?.label, "Zagreb");
});
