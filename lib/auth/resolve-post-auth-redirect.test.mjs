import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendAuthCallbackErrorToPath,
  isSignupAuthCallbackType,
  resolvePostAuthRedirectPath,
} from "./resolve-post-auth-redirect.mjs";

describe("resolve post-auth redirect (simplified URLs)", () => {
  it("sends to / after signup", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/",
        hadPendingAction: false,
        authCallbackType: "signup",
      }),
      "/"
    );
  });

  it("sends to / after onboarding with a pending action", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/",
        hadPendingAction: true,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("keeps a catalog filter query after login", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/?filter=sci-fi",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/?filter=sci-fi"
    );
  });

  it("keeps a catalog filter query after signup or a pending action", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/?media=live_action&filter=landscapes",
        hadPendingAction: false,
        authCallbackType: "signup",
      }),
      "/?media=live_action&filter=landscapes"
    );
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/?filter=sci-fi",
        hadPendingAction: true,
        authCallbackType: "email",
      }),
      "/?filter=sci-fi"
    );
  });

  it("still sends signup from a non-catalog page to /", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/guides/films-like-flow",
        hadPendingAction: false,
        authCallbackType: "signup",
      }),
      "/"
    );
  });

  it("replaces /saved with / (Saved is a view on /)", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/saved",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("replaces /watched with / (Watched is a view on /)", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/watched",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("replaces legacy /films with /", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/films",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("replaces legacy /my-profile with /", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/my-profile",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("replaces /account with /", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/account",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("replaces /p/slug?token=x with /", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/p/maria?token=secret",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("detects signup callback types case-insensitively", () => {
    assert.equal(isSignupAuthCallbackType("SIGNUP"), true);
    assert.equal(isSignupAuthCallbackType("email"), false);
  });

  it("appends callback error details to the redirect path", () => {
    assert.equal(
      appendAuthCallbackErrorToPath(
        "/",
        "Could not save your film action.",
        "pending_action_failed"
      ),
      "/?error=Could+not+save+your+film+action.&auth_error=pending_action_failed"
    );
  });
});
