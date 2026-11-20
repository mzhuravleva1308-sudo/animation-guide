import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNewUserSignupEmail,
  sendNewUserSignupEmail,
} from "./send-new-user-signup-email.mjs";
import { notifyNewUserSignup } from "./auth/notify-new-user-signup.mjs";

describe("formatNewUserSignupEmail", () => {
  it("includes email, ids, and slug", () => {
    const email = formatNewUserSignupEmail({
      email: "viewer@example.com",
      userId: "user-1",
      profileId: "profile-1",
      profileSlug: "viewer",
      createdAt: "2026-11-18T12:00:00.000Z",
    });

    assert.match(email.subject, /viewer@example.com/);
    assert.match(email.text, /viewer@example.com/);
    assert.match(email.text, /user-1/);
    assert.match(email.text, /profile-1/);
    assert.match(email.text, /viewer/);
  });
});

describe("sendNewUserSignupEmail", () => {
  it("posts to Resend without leaking the API key", async () => {
    const calls = [];
    await sendNewUserSignupEmail(
      {
        email: "viewer@example.com",
        userId: "user-1",
        profileId: "profile-1",
        profileSlug: "viewer",
      },
      {
        apiKey: "re_test_key",
        to: "owner@example.com",
        from: "Resonale <reports@example.com>",
        fetchImpl: async (url, init) => {
          calls.push({ url, init });
          return { ok: true, status: 200, text: async () => "" };
        },
      }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to[0], "owner@example.com");
    assert.match(body.subject, /viewer@example.com/);
    assert.doesNotMatch(body.text, /re_test_key/);
  });
});

describe("notifyNewUserSignup", () => {
  it("skips when Resend is not configured", async () => {
    const previousKey = process.env.RESEND_API_KEY;
    const previousTo = process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL;
    const previousWeekly = process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL;
    delete process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL;

    try {
      const result = await notifyNewUserSignup({
        user: { id: "user-1", email: "a@b.com" },
        profile: { id: "profile-1", slug: "a" },
        sendEmailFn: async () => {
          throw new Error("should not send");
        },
      });
      assert.deepEqual(result, { sent: false, reason: "missing_api_key" });
    } finally {
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
      if (previousTo === undefined) delete process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL;
      else process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL = previousTo;
      if (previousWeekly === undefined) {
        delete process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL;
      } else {
        process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL = previousWeekly;
      }
    }
  });

  it("swallows send failures", async () => {
    const previousKey = process.env.RESEND_API_KEY;
    const previousTo = process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL = "owner@example.com";

    try {
      const result = await notifyNewUserSignup({
        user: { id: "user-1", email: "a@b.com" },
        profile: { id: "profile-1", slug: "a" },
        sendEmailFn: async () => {
          throw new Error("resend down");
        },
      });
      assert.deepEqual(result, { sent: false, reason: "send_failed" });
    } finally {
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
      if (previousTo === undefined) delete process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL;
      else process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL = previousTo;
    }
  });
});
