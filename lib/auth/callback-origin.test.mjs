import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveAuthOrigin,
  resolveAuthOriginFromRequest,
  sanitizeNextPath,
} from "./callback-origin.mjs";
import { POST_AUTH_PATH } from "./post-auth-path.mjs";

describe("sanitizeNextPath", () => {
  it("allows relative in-app paths", () => {
    assert.equal(sanitizeNextPath("/films"), "/films");
  });

  it("rejects open redirects", () => {
    assert.equal(sanitizeNextPath("//evil.example"), POST_AUTH_PATH);
    assert.equal(sanitizeNextPath("https://evil.example"), POST_AUTH_PATH);
    assert.equal(sanitizeNextPath(null), POST_AUTH_PATH);
  });
});

describe("resolveAuthOrigin", () => {
  it("prefers the browser or request origin over NEXT_PUBLIC_SITE_URL", () => {
    assert.equal(
      resolveAuthOrigin("http://localhost:3000", "http://127.0.0.1:3000"),
      "http://localhost:3000"
    );
  });

  it("falls back to NEXT_PUBLIC_SITE_URL when no origin is available", () => {
    assert.equal(
      resolveAuthOrigin(null, "http://127.0.0.1:3000"),
      "http://127.0.0.1:3000"
    );
  });

  it("defaults to localhost when no origin or site URL is configured", () => {
    assert.equal(resolveAuthOrigin(), "http://localhost:3000");
  });
});

describe("resolveAuthOriginFromRequest", () => {
  it("derives the origin from the incoming request", () => {
    const request = new Request("http://localhost:3000/auth/callback?code=abc");
    assert.equal(resolveAuthOriginFromRequest(request), "http://localhost:3000");
  });
});
