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
          value: encodeURIComponent("/films"),
        },
      ]),
      "/films"
    );
  });

  it("prefers the query param over the cookie", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/my-profile", [
        {
          name: AUTH_NEXT_PATH_COOKIE_NAME,
          value: encodeURIComponent("/films"),
        },
      ]),
      "/my-profile"
    );
  });

  it("falls back to the cookie when next is missing", () => {
    assert.equal(
      resolveAuthCallbackNextPath(null, [
        {
          name: AUTH_NEXT_PATH_COOKIE_NAME,
          value: encodeURIComponent("/films"),
        },
      ]),
      "/films"
    );
  });
});
