import test from "node:test";
import assert from "node:assert/strict";
import { auditFilmTrailers } from "./audit-film-trailers.mjs";

test("auditFilmTrailers reports missing and deleted YouTube trailers", async () => {
  const report = await auditFilmTrailers(
    [
      {
        id: "1",
        title: "No Trailer",
        media_type: "animation",
        catalog_visible: true,
        trailer_url: null,
      },
      {
        id: "2",
        title: "Dead Trailer",
        year: 2011,
        media_type: "live_action",
        catalog_visible: true,
        trailer_url: "https://www.youtube.com/watch?v=TS3SrQaRqmg",
        trailer_video_id: "TS3SrQaRqmg",
        trailer_source: "auto",
      },
      {
        id: "3",
        title: "Live Trailer",
        media_type: "animation",
        catalog_visible: true,
        trailer_url: "https://www.youtube.com/watch?v=liveVideo11",
        trailer_video_id: "liveVideo11",
      },
    ],
    {
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "liveVideo11",
              status: { privacyStatus: "public", uploadStatus: "processed" },
              snippet: { title: "Live" },
            },
          ],
        }),
      }),
    }
  );

  assert.equal(report.total, 3);
  assert.equal(report.withTrailer, 2);
  assert.equal(report.missingTrailer, 1);
  assert.equal(report.brokenTrailer, 1);
  assert.equal(report.broken[0].title, "Dead Trailer");
  assert.equal(report.broken[0].issue, "youtube_video_not_found");
});
