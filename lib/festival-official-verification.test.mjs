import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchFestivalOfficialSource,
  buildOfficialArchiveUrls,
} from "./festival-official-sources.mjs";
import {
  confirmCandidateOnOfficialPage,
  extractOfficialLinksFromSearchHtml,
  extractProgrammeLinksFromIndexHtml,
  isAnnecyProofUrl,
  isRateLimitedFestivalResponse,
  pageContainsFilm,
  refineRecognitionFromOfficialPage,
  textMatchesTitleVariant,
} from "./festival-official-verification.mjs";
import { EVIDENCE_STATUSES } from "./festival-evidence-quality.mjs";

describe("matchFestivalOfficialSource", () => {
  it("matches configured catalog festivals", () => {
    assert.equal(matchFestivalOfficialSource("Annecy")?.id, "annecy");
    assert.equal(
      matchFestivalOfficialSource("Berlin International Film Festival")?.id,
      "berlinale"
    );
    assert.equal(
      matchFestivalOfficialSource("Cannes Film Festival")?.id,
      "cannes"
    );
    assert.equal(
      matchFestivalOfficialSource("BFI London Film Festival")?.id,
      "bfi_london"
    );
  });
});

describe("buildOfficialArchiveUrls", () => {
  it("builds year-specific archive URLs", () => {
    const source = matchFestivalOfficialSource("Annecy");
    assert.ok(source);
    const urls = buildOfficialArchiveUrls(source, 1995);
    assert.ok(urls.some((url) => url.includes("1995")));
    assert.ok(
      urls.some((url) =>
        url.includes("annecyfestival.com/about/archives:en/1995:en/award-winners")
      )
    );
  });

  it("includes annecy.org official selection pages for recent years", () => {
    const source = matchFestivalOfficialSource("Annecy");
    assert.ok(source);
    const urls = buildOfficialArchiveUrls(source, 2022);
    assert.ok(
      urls.some((url) =>
        url.includes("annecy.org/about/archives/2022/official-selection:lm")
      )
    );
    assert.ok(
      urls.some((url) =>
        url.includes("annecy.org/about/archives/2022/official-selection:lmcc")
      )
    );
  });

  it("includes Berlinale programme index for a festival year", () => {
    const source = matchFestivalOfficialSource("Berlin International Film Festival");
    assert.ok(source);
    const urls = buildOfficialArchiveUrls(source, 2017);
    assert.ok(urls.some((url) => url.includes("/en/2017/programme/")));
  });
});

describe("refineRecognitionFromOfficialPage", () => {
  it("maps Directors' Fortnight to official_selection with section", () => {
    const refined = refineRecognitionFromOfficialPage(
      "Ghost Cat Anzu in the Directors' Fortnight section at Cannes 2024",
      {
        festival_name: "Cannes Film Festival",
        festival_year: 2024,
        recognition_type: "screening",
        original_text: "premiered in the Directors' Fortnight section",
      }
    );

    assert.equal(refined?.recognition_type, "official_selection");
    assert.equal(refined?.section, "Directors' Fortnight");
  });

  it("maps Berlinale competition to official_selection", () => {
    const refined = refineRecognitionFromOfficialPage(
      "Have a Nice Day in the main competition for the Golden Bear at Berlinale 2017",
      {
        festival_name: "Berlin International Film Festival",
        festival_year: 2017,
        recognition_type: "screening",
        original_text: "premiered in the main competition",
      }
    );

    assert.equal(refined?.recognition_type, "official_selection");
    assert.equal(refined?.section, "Competition");
  });

  it("keeps plain premiere as screening", () => {
    const refined = refineRecognitionFromOfficialPage(
      "The film made its world premiere at BFI London Film Festival 2014",
      {
        festival_name: "BFI London Film Festival",
        festival_year: 2014,
        recognition_type: "screening",
        original_text: "world premiere at BFI London Film Festival",
      }
    );

    assert.equal(refined?.recognition_type, "screening");
  });
});

describe("confirmCandidateOnOfficialPage", () => {
  it("confirms winner on official awards page text", () => {
    const pageText = `
      Annecy 1995 Awards
      Grand Prix: Pom Poko
      Feature Films in Competition
    `;

    const confirmation = confirmCandidateOnOfficialPage(
      pageText,
      { title: "Pom Poko", year: 1994 },
      {
        festival_name: "Annecy International Animation Film Festival",
        festival_year: 1995,
        recognition_type: "winner",
        award_name: "Grand Prix",
        original_text: "won the Grand Prix at Annecy in 1995",
      }
    );

    assert.ok(confirmation);
    assert.equal(confirmation.recognition_type, "winner");
    assert.match(confirmation.original_text ?? "", /Pom Poko/i);
  });

  it("rejects pages without the film title", () => {
    const confirmation = confirmCandidateOnOfficialPage(
      "Annecy 1995 Awards for other films",
      { title: "Pom Poko", year: 1994 },
      {
        festival_name: "Annecy International Animation Film Festival",
        festival_year: 1995,
        recognition_type: "winner",
      }
    );

    assert.equal(confirmation, null);
  });

  it("confirms official competition selection on annecy.org archive page", () => {
    const pageText = `
      Official Selection Feature Films in Competition
      Unicorn Wars
      Directed by: Alberto VÁZQUEZ
      Country: Spain, France
      2022
    `;

    const confirmation = confirmCandidateOnOfficialPage(
      pageText,
      { title: "Unicorn Wars", year: 2022 },
      {
        festival_name: "46th Annecy International Animation Film Festival",
        festival_year: 2022,
        recognition_type: "official_selection",
        section: "official competition",
        original_text:
          "presented at the 46th Annecy International Animation Film Festival on 16 June 2022, as part of the festival's official competition",
      }
    );

    assert.ok(confirmation);
    assert.equal(confirmation.recognition_type, "official_selection");
    assert.match(confirmation.original_text ?? "", /Unicorn Wars/i);
  });
});

describe("extractOfficialLinksFromSearchHtml", () => {
  it("extracts only configured official domains from search HTML", () => {
    const source = matchFestivalOfficialSource("Annecy");
    assert.ok(source);

    const links = extractOfficialLinksFromSearchHtml(
      `<a href="https://www.annecyfestival.com/about/archives:en/1995:en/award-winners">A</a><a href="https://en.wikipedia.org/wiki/X">B</a>`,
      source
    );

    assert.deepEqual(links, [
      "https://www.annecyfestival.com/about/archives:en/1995:en/award-winners",
    ]);
  });
});

describe("pageContainsFilm", () => {
  it("matches festival year instead of production year when provided", () => {
    assert.equal(
      pageContainsFilm(
        "Pom Poko won the Grand Prix at Annecy 1995",
        { title: "Pom Poko", year: 1994 },
        { festivalYear: 1995 }
      ),
      true
    );
  });

  it("matches spaced and compact title variants", () => {
    assert.equal(
      pageContainsFilm(
        "Award for best feature Heisei tanuki gassen Pompoko Director Isao Takahata 1995",
        { title: "Pom Poko", year: 1994 },
        { festivalYear: 1995 }
      ),
      true
    );
  });
});

describe("extractProgrammeLinksFromIndexHtml", () => {
  it("finds Berlinale film pages from a programme index", () => {
    const source = matchFestivalOfficialSource("Berlin International Film Festival");
    assert.ok(source);

    const html = `
      <a href="/en/2017/programme/201718718.html">Have a Nice Day</a>
      <a href="/en/2017/programme/201718719.html">Other Film</a>
    `;

    const links = extractProgrammeLinksFromIndexHtml(
      html,
      { title: "Have a Nice Day" },
      source,
      "https://www.berlinale.de/en/2017/programme/"
    );

    assert.ok(
      links.some((url) => url.includes("201718718.html")),
      "expected programme film URL"
    );
  });
});

describe("textMatchesTitleVariant", () => {
  it("matches compact spellings without spaces", () => {
    assert.equal(textMatchesTitleVariant("Grand Prix Pompoko 1995", "Pom Poko"), true);
  });
});

describe("isAnnecyProofUrl", () => {
  it("accepts annecyfestival.com and rejects annecy.org for proof", () => {
    assert.equal(
      isAnnecyProofUrl(
        "https://www.annecyfestival.com/about/archives:en/2022:en/award-winners"
      ),
      true
    );
    assert.equal(
      isAnnecyProofUrl("https://www.annecy.org/about/archives/2022/official-selection:lm"),
      false
    );
  });
});

describe("verification status semantics", () => {
  it("uses confirmed_official_source label in verification flow", () => {
    assert.equal(
      EVIDENCE_STATUSES.CONFIRMED_OFFICIAL,
      "confirmed_official_source"
    );
  });
});

describe("isRateLimitedFestivalResponse", () => {
  it("detects HTTP 429", () => {
    assert.equal(
      isRateLimitedFestivalResponse({ status: 429 }, ""),
      true
    );
  });

  it("detects 429 error page body", () => {
    assert.equal(
      isRateLimitedFestivalResponse(
        { status: 200 },
        "<html><body><h1>429 Too Many Requests</h1></body></html>"
      ),
      true
    );
  });

  it("allows normal archive pages", () => {
    assert.equal(
      isRateLimitedFestivalResponse(
        { status: 200 },
        "<html><body>Official selection programme with many films listed here.</body></html>"
      ),
      false
    );
  });
});
