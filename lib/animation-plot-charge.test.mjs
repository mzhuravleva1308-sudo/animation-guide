import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPlotChargeForEmbedding,
  normalizePlotCharge,
  PLOT_CHARGE_PILOT_TITLES,
} from "./animation-plot-charge.mjs";

describe("animation-plot-charge", () => {
  it("normalizes a valid charge object", () => {
    const out = normalizePlotCharge({
      headline: "  Shared danger forges trust. ",
      charge_lines: [
        "Isolation under flood forces cohabitation.",
        "Mutual dependence grows through survival tasks.",
        "",
      ],
      confidence: "high",
    });
    assert.deepEqual(out, {
      headline: "Shared danger forges trust.",
      charge_lines: [
        "Isolation under flood forces cohabitation.",
        "Mutual dependence grows through survival tasks.",
      ],
      confidence: "high",
    });
  });

  it("rejects incomplete charge", () => {
    assert.equal(normalizePlotCharge({ headline: "Only headline", charge_lines: ["one"] }), null);
    assert.equal(normalizePlotCharge(null), null);
  });

  it("formats embedding text and rewrites arrow schemas", () => {
    const text = formatPlotChargeForEmbedding({
      headline: "A → B → C",
      charge_lines: ["First beat", "Second beat."],
    });
    assert.equal(
      text,
      "plot charge: A, then B, then C. | First beat. | Second beat."
    );
  });

  it("keeps a 20-title pilot set", () => {
    assert.equal(PLOT_CHARGE_PILOT_TITLES.length, 20);
    assert.ok(PLOT_CHARGE_PILOT_TITLES.includes("Flow"));
  });
});
