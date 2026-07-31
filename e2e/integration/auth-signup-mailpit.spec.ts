import { test, expect } from "@playwright/test";
import {
  countProfilesForUserId,
  createConfirmedEmailUserWithoutProfileForTests,
  deleteAuthUserByEmailForTests,
  findAuthUserIdByEmail,
  findProfileByUserId,
  uniquePersonalGuideTestEmail,
} from "../helpers/e2e-auth-profile";
import {
  completeLoginMagicLinkSignIn,
  getSignupConfirmationSkipReason,
  requestLoginMagicLink,
  uniqueSignupTestEmail,
} from "../helpers/signup-confirmation-auth";

test.describe("Email magic-link sign-in with Mailpit", () => {
  let skipReason: string | null = null;

  test.beforeAll(async () => {
    skipReason = await getSignupConfirmationSkipReason();
  });

  test.beforeEach(async () => {
    test.skip(
      skipReason !== null,
      skipReason ?? "Mailpit magic-link prerequisites missing."
    );
  });

  test("sends a magic link, establishes a session, and provisions a profile", async ({
    page,
  }) => {
    const email = uniqueSignupTestEmail();

    const sentAfter = await requestLoginMagicLink(page, email);
    await expect(page.getByTestId("login-sent-heading")).toBeVisible();

    const confirmationUrl = await completeLoginMagicLinkSignIn(
      page,
      email,
      sentAfter
    );

    expect(confirmationUrl).toMatch(/token_hash=.*type=(email|signup)/i);
    const userId = await findAuthUserIdByEmail(email);
    expect(userId).toBeTruthy();
    await expect.poll(async () => countProfilesForUserId(userId!)).toBe(1);

    const profile = await findProfileByUserId(userId!);
    expect(profile?.slug).toBeTruthy();
    expect(profile?.share_token).toBeTruthy();
    expect(profile?.user_id).toBe(userId);
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(page.getByTestId("auth-status")).toBeVisible();
  });
});

test.describe("Magic-link profile recovery", () => {
  let skipReason: string | null = null;

  test.beforeAll(async () => {
    skipReason = await getSignupConfirmationSkipReason();
  });

  test.beforeEach(async () => {
    test.skip(
      skipReason !== null,
      skipReason ?? "Mailpit magic-link prerequisites missing."
    );
  });

  test("creates a missing profile after magic-link sign-in", async ({
    page,
  }) => {
    const email = uniquePersonalGuideTestEmail("magic-link-recovery");
    const userId = await createConfirmedEmailUserWithoutProfileForTests(email);

    try {
      const sentAfter = await requestLoginMagicLink(page, email);
      await completeLoginMagicLinkSignIn(page, email, sentAfter);

      await expect.poll(async () => countProfilesForUserId(userId)).toBe(1);
      expect((await findProfileByUserId(userId))?.user_id).toBe(userId);
      await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    } finally {
      await deleteAuthUserByEmailForTests(email);
    }
  });
});
