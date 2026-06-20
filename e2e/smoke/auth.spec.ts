import { test, expect } from "@playwright/test";
import {
  completeSignupConfirmation,
  getSignupConfirmationSkipReason,
  requestPasswordSignUp,
  uniqueSignupTestEmail,
} from "../helpers/signup-confirmation-auth";

test.describe("Login page", () => {
  test("renders a unified sign-in screen", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("oauth-google")).toHaveCount(0);
    await expect(page.getByTestId("oauth-apple")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Email sign-in" })).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByTestId("login-create-account")).toBeVisible();
    await expect(page.getByTestId("login-use-email-link")).toBeVisible();
    await expect(page.getByTestId("auth-status")).toHaveCount(0);
  });

  test("switches email sign-in to email link mode", async ({ page }) => {
    await page.goto("/login");

    await page.getByTestId("login-use-email-link").click();

    await expect(
      page.getByRole("button", { name: "Send sign-in link" })
    ).toBeVisible();
    await expect(page.getByTestId("login-password")).toHaveCount(0);
    await expect(page.getByTestId("login-use-password")).toBeVisible();
  });
});

test.describe("Account control", () => {
  test("shows login link on the home page when signed out", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Animation Guide" })).toBeVisible();
    await expect(page.getByTestId("auth-status")).toContainText("Log in");
    await expect(page.getByTestId("auth-email")).toHaveCount(0);
  });
});

test.describe("My profile", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/my-profile");

    await expect(page).toHaveURL(/\/login$/);
  });
});

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
    await expect(page.getByTestId("my-profile-empty")).toBeVisible();
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  });
});
