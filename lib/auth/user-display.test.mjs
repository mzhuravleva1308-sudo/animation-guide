import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getUserDisplayEmail } from "./user-display.mjs";

describe("getUserDisplayEmail", () => {
  it("prefers the primary auth email", () => {
    assert.equal(
      getUserDisplayEmail({ email: "maria@example.com", identities: [] }),
      "maria@example.com"
    );
  });

  it("falls back to an OAuth identity email", () => {
    assert.equal(
      getUserDisplayEmail({
        email: null,
        identities: [
          {
            identity_data: {
              email: "relay@privaterelay.appleid.com",
            },
          },
        ],
      }),
      "relay@privaterelay.appleid.com"
    );
  });

  it("returns a generic label when no email is available", () => {
    assert.equal(getUserDisplayEmail({ email: null, identities: [] }), "Signed in");
  });
});
