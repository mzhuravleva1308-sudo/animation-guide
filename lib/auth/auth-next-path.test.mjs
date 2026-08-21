import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_NEXT_PATH_COOKIE_NAME,
  readAuthNextPathFromCookies,
  resolveAuthCallbackNextPath,
} from "./auth-next-path.mjs";

describe("auth next path cookie", () => {
  it("reads a sanitized next path from cookies", () => {
    assert.equal(
      readAuthNextPathFromCookies([
        {
          name: AUTH_NEXT_PATH_COOKIE_NAME,
          value: encodeURIComponent("/login"),
        },
      ]),
      "/login"
    );
  });

  it("prefers the query param over the cookie", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/", [
        {
          name: AUTH_NEXT_PATH_COOKIE_NAME,
          value: encodeURIComponent("/login"),
        },
      ]),
      "/"
    );
  });

  it("falls back to the cookie when next is missing", () => {
    assert.equal(
      resolveAuthCallbackNextPath(null, [
        {
          name: AUTH_NEXT_PATH_COOKIE_NAME,
          value: encodeURIComponent("/"),
        },
      ]),
      "/"
    );
  });

  it("keeps a catalog filter query", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/?filter=sci-fi", []),
      "/?filter=sci-fi"
    );
  });

  it("replaces retired /films with /", () => {
    assert.equal(resolveAuthCallbackNextPath("/films", []), "/");
  });

  it("replaces retired /my-profile with /", () => {
    assert.equal(resolveAuthCallbackNextPath("/my-profile", []), "/");
  });

  it("replaces /saved and /watched with /", () => {
    assert.equal(resolveAuthCallbackNextPath("/saved", []), "/");
    assert.equal(resolveAuthCallbackNextPath("/watched", []), "/");
  });

  it("replaces /films in cookie with /", () => {
    assert.equal(
      resolveAuthCallbackNextPath(null, [
        {
          name: AUTH_NEXT_PATH_COOKIE_NAME,
          value: encodeURIComponent("/films"),
        },
      ]),
      "/"
    );
  });
});
