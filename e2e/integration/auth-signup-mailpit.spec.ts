import { test, expect } from "@playwright/test";
import {
  countProfilesForUserId,
  createPasswordUserWithoutProfileForTests,
  deleteAuthUserByEmailForTests,
  findAuthUserIdByEmail,
  findProfileByUserId,
  uniquePersonalGuideTestEmail,
} from "../helpers/e2e-auth-profile";
import {
  completeSignupConfirmation,
  getSignupConfirmationSkipReason,
  requestPasswordSignUp,
  uniqueSignupTestEmail,
} from "../helpers/signup-confirmation-auth";

test.describe("Password sign-up email confirmation with Mailpit", () => {
  let skipReason: string | null = null;

  test.beforeAll(async () => {
    skipReason = await getSignupConfirmationSkipReason();
  });

  test.beforeEach(async () => {
    test.skip(
      skipReason !== null,
      skipReason ?? "Mailpit signup-confirmation prerequisites missing."
    );
  });

  test("confirms email, establishes a session, and redirects to my-profile", async ({
    page,
  }) => {
    const email = uniqueSignupTestEmail();
    const password = "local-test-password";

    const sentAfter = await requestPasswordSignUp(page, email, password);
    await expect(page.getByTestId("login-message")).toContainText(
      /check your email/i
    );

    const confirmationUrl = await completeSignupConfirmation(
      page,
      email,
      sentAfter
    );

    expect(confirmationUrl).toMatch(/token_hash=.*type=signup/i);
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

test.describe("Password sign-in profile recovery", () => {
  test("creates a missing profile after password sign-in", async ({ page }) => {
    const email = uniquePersonalGuideTestEmail("password-recovery");
    const password = "local-test-password";
    const userId = await createPasswordUserWithoutProfileForTests(
      email,
      password
    );

    try {
      await page.goto("/login");
      await page.getByTestId("login-email").fill(email);
      await page.getByTestId("login-password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/\/p\/[^/?#]+\?token=/, {
        timeout: 20_000,
      });
      await expect.poll(async () => countProfilesForUserId(userId)).toBe(1);
      expect((await findProfileByUserId(userId))?.user_id).toBe(userId);
    } finally {
      await deleteAuthUserByEmailForTests(email);
    }
  });
});
