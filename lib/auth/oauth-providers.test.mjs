import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOAuthSignInLabel,
  parseOAuthProviders,
  resolveOAuthProviders,
} from "./oauth-providers.mjs";

describe("parseOAuthProviders", () => {
  it("returns an empty list when env is unset", () => {
    assert.deepEqual(parseOAuthProviders(), []);
    assert.deepEqual(parseOAuthProviders(""), []);
    assert.deepEqual(parseOAuthProviders("   "), []);
  });

  it("parses supported providers in order without duplicates", () => {
    assert.deepEqual(parseOAuthProviders("apple,google"), ["apple", "google"]);
    assert.deepEqual(parseOAuthProviders("google, apple, google"), ["google", "apple"]);
  });

  it("ignores unsupported provider names", () => {
    assert.deepEqual(parseOAuthProviders("apple,github,twitter"), ["apple"]);
  });
});

describe("resolveOAuthProviders", () => {
  it("hides OAuth buttons when env is unset", () => {
    assert.deepEqual(resolveOAuthProviders(), []);
    assert.deepEqual(resolveOAuthProviders(undefined), []);
  });

  it("hides OAuth buttons when env is an empty string", () => {
    assert.deepEqual(resolveOAuthProviders(""), []);
  });

  it("shows providers only when explicitly configured", () => {
    assert.deepEqual(resolveOAuthProviders("apple"), ["apple"]);
    assert.deepEqual(resolveOAuthProviders("google,apple"), ["google", "apple"]);
  });
});

describe("getOAuthSignInLabel", () => {
  it("returns provider-specific sign-in labels", () => {
    assert.equal(getOAuthSignInLabel("apple"), "Sign in with Apple");
    assert.equal(getOAuthSignInLabel("google"), "Sign in with Google");
  });
});
