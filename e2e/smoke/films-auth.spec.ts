import { test, expect } from "@playwright/test";
import {
  completeFilmsEmailOtpSignIn,
  getEmailOtpFlowSkipReason,
  requestFilmsEmailOtp,
  uniqueOtpTestEmail,
} from "../helpers/email-otp-auth";

test.describe("Films email OTP auth", () => {
  test("shows a subtle login control when signed out", async ({ page }) => {
    await page.goto("/films");

    await expect(
      page.getByRole("heading", { name: "Animation Guide" })
    ).toBeVisible();
    await expect(page.getByTestId("auth-status")).toHaveText("Log in");
    await expect(page.getByTestId("account-menu-trigger")).toHaveCount(0);
  });

  test("closes the modal with Escape and overlay click", async ({ page }) => {
    await page.goto("/films");
    await page.getByTestId("auth-status").click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await page.getByTestId("auth-status").click();
    await page.getByTestId("email-auth-modal-overlay").click({
      position: { x: 8, y: 8 },
    });
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);
  });
});

test.describe("Films email OTP send handling", () => {
  const otpRoute = "**/auth/v1/otp*";
  const testEmail = "otp-flow@example.test";

  async function openFilmsAuthModal(page: import("@playwright/test").Page) {
    await page.goto("/films");
    await page.getByTestId("auth-status").click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();
  }

  async function submitFilmsAuthEmail(
    page: import("@playwright/test").Page,
    email: string
  ) {
    await page.getByTestId("email-auth-email").fill(email);
    await page.getByTestId("email-auth-continue").click();
  }

  test("advances to the code step when signInWithOtp succeeds", async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route(otpRoute, async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await openFilmsAuthModal(page);
    await submitFilmsAuthEmail(page, testEmail);

    await expect(page.getByTestId("email-auth-otp")).toBeVisible();
    await expect(page.getByTestId("email-auth-code-sent-message")).toContainText(
      "We sent a 6-digit code"
    );
    expect(requestCount).toBe(1);
  });

  test("rate-limited send opens code step without claiming a new send", async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route(otpRoute, async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "over_email_send_rate_limit",
          error_description:
            "For security purposes, you can only request this once every 60 seconds",
        }),
      });
    });

    await openFilmsAuthModal(page);
    await submitFilmsAuthEmail(page, testEmail);

    await expect(page.getByTestId("email-auth-otp")).toBeVisible();
    await expect(page.getByTestId("email-auth-code-existing-message")).toBeVisible();
    await expect(page.getByTestId("email-auth-code-sent-message")).toHaveCount(0);
    await expect(page.getByTestId("email-auth-change-email")).toBeVisible();
    expect(requestCount).toBe(1);
  });

  test("keeps the email step on a real send failure", async ({ page }) => {
    await page.route(otpRoute, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "unexpected_failure",
          message: "Server exploded",
        }),
      });
    });

    await openFilmsAuthModal(page);
    await submitFilmsAuthEmail(page, testEmail);

    await expect(page.getByTestId("email-auth-email")).toBeVisible();
    await expect(page.getByTestId("email-auth-otp")).toHaveCount(0);
    await expect(page.getByTestId("email-auth-message")).toContainText(
      /wrong|try again/i
    );
  });

  test("rate-limited resend stays on the code step with a cooldown message", async ({
    page,
  }) => {
    await page.clock.install();

    let requestCount = 0;
    await page.route(otpRoute, async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
        return;
      }

      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "over_email_send_rate_limit",
          error_description:
            "For security purposes, you can only request this once every 60 seconds",
        }),
      });
    });

    await openFilmsAuthModal(page);
    await submitFilmsAuthEmail(page, testEmail);
    await expect(page.getByTestId("email-auth-otp")).toBeVisible();

    await page.clock.fastForward(31_000);
    await page.getByTestId("email-auth-resend").click();
    await expect(page.getByTestId("email-auth-otp")).toBeVisible();
    await expect(page.getByTestId("email-auth-message")).toContainText(
      /wait before resending/i
    );
    await expect(page.getByTestId("email-auth-code-existing-message")).toBeVisible();
    expect(requestCount).toBe(2);
  });
});

test.describe("Films email OTP auth with Mailpit", () => {
  let otpFlowSkipReason: string | null = null;

  test.beforeAll(async () => {
    otpFlowSkipReason = await getEmailOtpFlowSkipReason();
  });

  test.beforeEach(async () => {
    test.skip(
      otpFlowSkipReason !== null,
      otpFlowSkipReason ?? "Mailpit OTP prerequisites missing."
    );
  });

  test("opens the auth modal and requests a code", async ({ page }) => {
    const email = uniqueOtpTestEmail("films-ui");

    await requestFilmsEmailOtp(page, email);

    await expect(page.getByTestId("email-auth-otp")).toBeFocused();
    await expect(page.getByText(/We sent a 6-digit code to/)).toBeVisible();
    await expect(page.getByTestId("email-auth-change-email")).toBeVisible();
    await expect(page.getByTestId("email-auth-resend")).toBeVisible();
  });

  test("shows a safe error for an invalid code", async ({ page }) => {
    const email = uniqueOtpTestEmail("films-invalid");

    await requestFilmsEmailOtp(page, email);
    await page.getByTestId("email-auth-otp").fill("000000");
    await page.getByTestId("email-auth-verify").click();

    await expect(page.getByTestId("email-auth-message")).toContainText(
      /incorrect|try again/i
    );
    await expect(page.getByTestId("email-auth-message")).not.toContainText(
      /registered|account exists|not found/i
    );
  });

  test("retrieves the OTP from Mailpit and completes sign-in", async ({
    page,
  }) => {
    const email = uniqueOtpTestEmail("films-sign-in");
    const sentAfter = await requestFilmsEmailOtp(page, email);
    const code = await completeFilmsEmailOtpSignIn(page, email, sentAfter);

    expect(code).toMatch(/^\d{6}$/);
    await expect(page).toHaveURL(/\/films$/);
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(page.getByTestId("auth-status")).not.toContainText("Log in");
  });
});
