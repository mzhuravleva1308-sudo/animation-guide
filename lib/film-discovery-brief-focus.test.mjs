import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRIEF_FOCUS,
  countryMatchesPriority,
  filmMatchesBriefGap,
  focusManagerBrief,
  selectBriefRelevantFilms,
} from "./film-discovery-brief-focus.mjs";

const baseBrief = {
  priorityCountries: ["Bosnia", "Bulgaria", "Cambodia"],
  priorityYearsOrDecades: ["1920s"],
  priorityGenresOrThemes: ["alienated"],
  priorityTechniques: ["claymation", "cut-out"],
  overrepresented: ["country:France", "technique:anime"],
  underrepresented: ["country:Bosnia", "decade:1920s"],
  batchRequirements: ["Expand coverage for Bosnia"],
  summary: "mixed everything",
};

describe("film-discovery-brief-focus", () => {
  it("focuses brief to country only", () => {
    const focused = focusManagerBrief(baseBrief, BRIEF_FOCUS.country);
    assert.deepEqual(focused.priorityCountries, ["Bosnia", "Bulgaria", "Cambodia"]);
    assert.deepEqual(focused.priorityYearsOrDecades, []);
    assert.deepEqual(focused.priorityTechniques, []);
    assert.match(focused.summary, /countries/i);
  });

  it("matches Bosnia and Herzegovina to Bosnia priority", () => {
    assert.equal(
      countryMatchesPriority("Bosnia and Herzegovina", "Bosnia"),
      true
    );
  });

  it("selects only brief-relevant films", () => {
    const films = [
      { title: "A", year: 2018, country: "Bosnia and Herzegovina", technique: "2d" },
      { title: "B", year: 1926, country: "Germany", technique: "silhouette" },
      { title: "C", year: 2015, country: "France", technique: "claymation" },
      { title: "D", year: 2019, country: "United States", technique: "cgi" },
    ];
    const countryBrief = focusManagerBrief(baseBrief, BRIEF_FOCUS.country);
    const countryHits = selectBriefRelevantFilms(films, countryBrief);
    assert.deepEqual(
      countryHits.map((f) => f.title),
      ["A"]
    );

    const decadeBrief = focusManagerBrief(baseBrief, BRIEF_FOCUS.decade);
    assert.deepEqual(
      selectBriefRelevantFilms(films, decadeBrief).map((f) => f.title),
      ["B"]
    );

    const techBrief = focusManagerBrief(baseBrief, BRIEF_FOCUS.technique);
    assert.deepEqual(
      selectBriefRelevantFilms(films, techBrief).map((f) => f.title),
      ["C"]
    );

    assert.equal(filmMatchesBriefGap(films[3], countryBrief), false);
  });
});
