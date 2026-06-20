import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractMagicLinkFromEmailContent,
  isMalformedAuthEmailLink,
  isSignInMagicLink,
} from "./extract-magic-link-from-email.mjs";

describe("isSignInMagicLink", () => {
  it("accepts Supabase verify URLs", () => {
    assert.equal(
      isSignInMagicLink(
        "http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink&redirect_to=http%3A%2F%2F127.0.0.1%3A3100%2Fauth%2Fcallback"
      ),
      true
    );
  });

  it("accepts app callback URLs with token_hash", () => {
    assert.equal(
      isSignInMagicLink(
        "http://127.0.0.1:3100/auth/callback?token_hash=abc&type=magiclink&next=%2Ffilms"
      ),
      true
    );
    assert.equal(
      isSignInMagicLink(
        "http://127.0.0.1:3100/auth/callback?next=%2Fmy-profile&token_hash=abc&type=signup"
      ),
      true
    );
  });

  it("rejects unrelated URLs", () => {
    assert.equal(isSignInMagicLink("https://example.com/about"), false);
  });

  it("rejects site-root links with glued token_hash params", () => {
    assert.equal(
      isMalformedAuthEmailLink(
        "http://127.0.0.1:3000&token_hash=abc123&type=email"
      ),
      true
    );
    assert.equal(
      isSignInMagicLink(
        "http://127.0.0.1:3000&token_hash=abc123&type=email"
      ),
      false
    );
  });
});

describe("extractMagicLinkFromEmailContent", () => {
  it("extracts a sign-in link from plain text", () => {
    const url =
      "http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink&redirect_to=http%3A%2F%2F127.0.0.1%3A3100%2Fauth%2Fcallback";

    assert.equal(
      extractMagicLinkFromEmailContent(`Sign in here: ${url}`),
      url
    );
  });

  it("extracts a sign-in link from HTML email bodies", () => {
    const url =
      "http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink&redirect_to=http%3A%2F%2F127.0.0.1%3A3100%2Fauth%2Fcallback";
    const html = `
      <h2>Sign in</h2>
      <p><a href="${url}">Sign in</a></p>
    `;

    assert.equal(extractMagicLinkFromEmailContent(html), url);
  });

  it("extracts a PKCE-friendly callback URL from HTML email bodies", () => {
    const url =
      "http://127.0.0.1:3100/auth/callback?next=%2Ffilms&token_hash=abc123&type=email";
    const html = `
      <h2>Sign in</h2>
      <p><a href="${url}">Sign in</a></p>
    `;

    assert.equal(extractMagicLinkFromEmailContent(html), url);
  });

  it("extracts a signup confirmation callback URL from HTML email bodies", () => {
    const url =
      "http://127.0.0.1:3000/auth/callback?token_hash=abc123&type=signup";
    const html = `
      <h2>Confirm your email address</h2>
      <p><a href="${url}">Confirm email address</a></p>
    `;

    assert.equal(extractMagicLinkFromEmailContent(html), url);
  });
  it("extracts a signup confirmation callback URL from HTML email bodies", () => {
    const url =
      "http://127.0.0.1:3100/auth/callback?next=%2Fmy-profile&token_hash=abc123&type=signup";
    const html = `
      <h2>Confirm your email address</h2>
      <p><a href="${url}">Confirm email address</a></p>
    `;

    assert.equal(extractMagicLinkFromEmailContent(html), url);
  });

  it("returns null when no sign-in link is present", () => {
    assert.equal(
      extractMagicLinkFromEmailContent("Thanks for signing up."),
      null
    );
  });
});
