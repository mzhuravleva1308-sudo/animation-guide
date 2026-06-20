import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProfileSlugCandidate,
  deriveProfileNameFromEmail,
  deriveProfileSlugBase,
  isLinkedGuideProfile,
} from "./profile-provision.mjs";

describe("profile provision helpers", () => {
  it("derives a readable profile name from email", () => {
    assert.equal(
      deriveProfileNameFromEmail("maria.z@example.test"),
      "Maria Z"
    );
  });

  it("derives a stable slug base from email and user id", () => {
    const slug = deriveProfileSlugBase(
      "maria.z@example.test",
      "11111111-1111-4111-8111-111111111101"
    );

    assert.equal(slug, "maria-z-11111111");
  });

  it("adds numeric suffixes for slug collisions", () => {
    assert.equal(buildProfileSlugCandidate("maria-z-11111111", 0), "maria-z-11111111");
    assert.equal(buildProfileSlugCandidate("maria-z-11111111", 1), "maria-z-11111111-2");
  });

  it("detects a complete linked guide profile", () => {
    assert.equal(
      isLinkedGuideProfile(
        {
          id: "profile-id",
          slug: "maria-z-11111111",
          share_token: "token",
          user_id: "user-id",
        },
        "user-id"
      ),
      true
    );
    assert.equal(
      isLinkedGuideProfile(
        {
          id: "profile-id",
          slug: "maria-z-11111111",
          share_token: "token",
          user_id: null,
        },
        "user-id"
      ),
      false
    );
  });
});
