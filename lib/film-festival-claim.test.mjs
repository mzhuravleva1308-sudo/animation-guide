import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE_STATUSES } from "./festival-evidence-quality.mjs";
import {
  CLAIM_STATUSES,
  RECOGNITION_TYPE_POSSIBLE,
  buildPossibleParticipationDedupeKey,
  candidateToClaimRow,
  resolveClaimStatus,
} from "./film-festival-claim.mjs";

describe("resolveClaimStatus", () => {
  it("maps official verification to confirmed presence", () => {
    assert.equal(
      resolveClaimStatus(
        { evidence_status: EVIDENCE_STATUSES.CONFIRMED_OFFICIAL },
        {}
      ),
      CLAIM_STATUSES.CONFIRMED_PRESENCE
    );
  });

  it("maps enriched context to enriched", () => {
    assert.equal(
      resolveClaimStatus(
        { evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW },
        { enriched: true }
      ),
      CLAIM_STATUSES.ENRICHED
    );
  });

  it("maps skipped evidence to blocked", () => {
    assert.equal(
      resolveClaimStatus(
        { evidence_status: EVIDENCE_STATUSES.SKIPPED },
        {}
      ),
      CLAIM_STATUSES.BLOCKED
    );
  });

  it("maps rejected verification to rejected_after_verification", () => {
    assert.equal(
      resolveClaimStatus(
        { evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW },
        { rejected: true }
      ),
      CLAIM_STATUSES.REJECTED
    );
  });

  it("maps possible participation to possibly_at_festival", () => {
    assert.equal(
      resolveClaimStatus(
        { evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW, recognition_type: "possible_participation" },
        {}
      ),
      CLAIM_STATUSES.POSSIBLY
    );
  });
});

describe("candidateToClaimRow", () => {
  it("builds a stable possible-participation claim row", () => {
    const row = candidateToClaimRow(
      {
        festival_name: "Annecy International Animated Film Festival",
        festival_year: 2012,
        section: null,
        recognition_type: RECOGNITION_TYPE_POSSIBLE,
        award_name: null,
        source_type: "ai_inference",
        source_url: null,
        original_text: "Possibly participated at Annecy.",
        evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
        acceptance_reason: "Possibly at festival",
        importable: false,
      },
      "film-1",
      { festivalId: "annecy" }
    );

    assert.equal(row.film_id, "film-1");
    assert.equal(row.canonical_festival_id, "annecy");
    assert.equal(row.claim_status, CLAIM_STATUSES.POSSIBLY);
    assert.equal(row.dedupe_key, buildPossibleParticipationDedupeKey("annecy"));
  });
});
