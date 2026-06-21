import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFilmFestivalBadges,
  resolveFestivalBadgeId,
} from "./festival-badge.ts";

test("resolveFestivalBadgeId maps canonical ids and aliases", () => {
  assert.equal(resolveFestivalBadgeId("annecy"), "annecy");
  assert.equal(resolveFestivalBadgeId("Toronto International Film Festival"), "tiff");
  assert.equal(resolveFestivalBadgeId("Tokyo Anime Award Festival"), "tokyo_anime");
  assert.equal(resolveFestivalBadgeId("Venice"), null);
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
