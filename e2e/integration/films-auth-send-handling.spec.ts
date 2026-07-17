import { test, expect } from "@playwright/test";

test.describe("Films magic-link send handling", () => {
  const otpRoute = "**/auth/v1/otp*";
  const testEmail = "magic-link-flow@example.test";

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

  test("advances to the confirmation step when signInWithOtp succeeds", async ({
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

    await expect(page.getByTestId("email-auth-sent-heading")).toHaveText(
      "Check your inbox"
    );
    await expect(page.getByTestId("email-auth-link-sent-message")).toContainText(
      "We sent a sign-in link"
    );
    expect(requestCount).toBe(1);
  });

  test("rate-limited send opens confirmation without claiming a new send", async ({
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

    await expect(page.getByTestId("email-auth-sent-heading")).toBeVisible();
    await expect(page.getByTestId("email-auth-link-existing-message")).toBeVisible();
    await expect(page.getByTestId("email-auth-link-sent-message")).toHaveCount(0);
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
    await expect(page.getByTestId("email-auth-sent-heading")).toHaveCount(0);
    await expect(page.getByTestId("email-auth-message")).toContainText(
      /wrong|try again/i
    );
  });

  test("rate-limited resend stays on the confirmation step with a cooldown message", async ({
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
    await expect(page.getByTestId("email-auth-sent-heading")).toBeVisible();

    await page.clock.fastForward(31_000);
    await page.getByTestId("email-auth-resend").click();
    await expect(page.getByTestId("email-auth-sent-heading")).toBeVisible();
    await expect(page.getByTestId("email-auth-message")).toContainText(
      /wait before resending/i
    );
    await expect(page.getByTestId("email-auth-link-existing-message")).toBeVisible();
    expect(requestCount).toBe(2);
  });
});
