import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAuthCallbackUrl,
  resolveSiteUrl,
} from "./callback-url.mjs";
import { POST_AUTH_PATH } from "./post-auth-path.mjs";

describe("getAuthCallbackUrl", () => {
  it("appends /auth/callback with a default next path", () => {
    const expectedNext = encodeURIComponent(POST_AUTH_PATH);

    assert.equal(
      getAuthCallbackUrl("http://localhost:3000"),
      `http://localhost:3000/auth/callback?next=${expectedNext}`
    );
    assert.equal(
      getAuthCallbackUrl("http://localhost:3000/"),
      `http://localhost:3000/auth/callback?next=${expectedNext}`
    );
  });

  it("supports a custom next path", () => {
    assert.equal(
      getAuthCallbackUrl("http://localhost:3000", "/films"),
      "http://localhost:3000/auth/callback?next=%2Ffilms"
    );
  });
});

describe("resolveSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL style explicit config", () => {
    assert.equal(resolveSiteUrl("https://app.example.com/"), "https://app.example.com");
  });

  it("falls back to request origin", () => {
    assert.equal(resolveSiteUrl(null, "http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  });

  it("defaults to local dev URL", () => {
    assert.equal(resolveSiteUrl(), "http://localhost:3000");
  });
});
