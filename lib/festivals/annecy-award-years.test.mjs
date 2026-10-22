import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANNECY_FEATURE_AWARD_YEARS,
  annecyFeatureAwardYearOptions,
} from "./annecy-award-years.mjs";

describe("annecyFeatureAwardYearOptions", () => {
  it("lists newest-first Annecy years with paths under each year", () => {
    assert.deepEqual(ANNECY_FEATURE_AWARD_YEARS, [
      2026, 2025, 2024, 2023, 2022,
    ]);
    assert.deepEqual(annecyFeatureAwardYearOptions(2026), [
      { year: 2026, href: "/festivals/2026/annecy", active: true },
      { year: 2025, href: "/festivals/2025/annecy", active: false },
      { year: 2024, href: "/festivals/2024/annecy", active: false },
      { year: 2023, href: "/festivals/2023/annecy", active: false },
      { year: 2022, href: "/festivals/2022/annecy", active: false },
    ]);
  });
});
