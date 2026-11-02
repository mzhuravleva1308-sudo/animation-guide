import test from "node:test";
import assert from "node:assert/strict";
import {
  mubiUrlForRegion,
  normalizeMubiFilmUrl,
  normalizeMubiLinks,
  offersIncludeMubi,
} from "./mubi-watch-links.mjs";

test("normalizeMubiFilmUrl accepts localized and canonical film pages", () => {
  assert.deepEqual(
    normalizeMubiFilmUrl("https://mubi.com/en/es/films/flow-2024"),
    { slug: "flow-2024", url: "https://mubi.com/films/flow-2024" }
  );
  assert.deepEqual(normalizeMubiFilmUrl("https://mubi.com/films/flow-2024/"), {
    slug: "flow-2024",
    url: "https://mubi.com/films/flow-2024",
  });
  assert.equal(normalizeMubiFilmUrl("https://mubi.com/search?q=flow"), null);
  assert.equal(normalizeMubiFilmUrl("https://netflix.com/title/1"), null);
});

test("mubiUrlForRegion localizes by country code", () => {
  assert.equal(
    mubiUrlForRegion("https://mubi.com/films/flow-2024", "ES"),
    "https://mubi.com/en/es/films/flow-2024"
  );
});

test("normalizeMubiLinks and offersIncludeMubi", () => {
  assert.deepEqual(
    normalizeMubiLinks({
      checked_at: "2026-11-02T00:00:00.000Z",
      url: "https://mubi.com/en/fr/films/flow-2024",
    }),
    {
      checked_at: "2026-11-02T00:00:00.000Z",
      url: "https://mubi.com/films/flow-2024",
      slug: "flow-2024",
    }
  );
  assert.equal(offersIncludeMubi([{ provider: "MUBI" }]), true);
  assert.equal(offersIncludeMubi([{ provider: "Netflix" }]), false);
});
