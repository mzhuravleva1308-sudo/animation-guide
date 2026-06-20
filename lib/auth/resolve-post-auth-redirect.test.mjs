import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProfileGuidePath } from "./profile-guide-url.mjs";
import {
  appendAuthCallbackErrorToPath,
  isSignupAuthCallbackType,
  resolvePostAuthRedirectPath,
} from "./resolve-post-auth-redirect.mjs";

describe("resolve post-auth redirect", () => {
  const profile = {
    slug: "my-guide",
    share_token: "share-token-123",
  };

  it("opens the personal guide after signup", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        profile,
        nextPath: "/films",
        hadPendingAction: false,
        authCallbackType: "signup",
      }),
      buildProfileGuidePath(profile.slug, profile.share_token)
    );
  });

  it("opens the personal guide after onboarding with a pending action", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        profile,
        nextPath: "/films",
        hadPendingAction: true,
        authCallbackType: "email",
      }),
      buildProfileGuidePath(profile.slug, profile.share_token)
    );
  });

  it("returns to the original page for an existing-user login without onboarding", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        profile,
        nextPath: "/films",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/films"
    );
  });

  it("detects signup callback types case-insensitively", () => {
    assert.equal(isSignupAuthCallbackType("SIGNUP"), true);
    assert.equal(isSignupAuthCallbackType("email"), false);
  });

  it("appends callback error details to the redirect path", () => {
    assert.equal(
      appendAuthCallbackErrorToPath(
        "/films",
        "Could not save your film action.",
        "pending_action_failed"
      ),
      "/films?error=Could+not+save+your+film+action.&auth_error=pending_action_failed"
    );
  });
});
