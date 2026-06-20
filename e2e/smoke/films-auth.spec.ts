import { test, expect } from "@playwright/test";
import {
  completeFilmsMagicLinkSignIn,
  getMagicLinkFlowSkipReason,
  profileGuideUrlPattern,
  requestFilmsMagicLink,
  uniqueMagicLinkTestEmail,
} from "../helpers/magic-link-auth";
import {
  getProfileTestCredentials,
  profilePagePath,
} from "../helpers/profile-credentials";

test.describe("Films magic-link auth", () => {
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

  test("preserves scroll position when the auth modal closes", async ({ page }) => {
    await page.goto("/films");
    await expect(page.getByTestId("film-card").first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForFunction(() => window.scrollY >= 800);

    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);

    await page
      .getByRole("button", { name: "Add to watchlist" })
      .nth(2)
      .click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.getByTestId("email-auth-modal-close").click();
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .toBe(scrollBeforeOpen);
  });

  test("preserves scroll after closing auth opened from a film card action", async ({
    page,
  }) => {
    await page.goto("/films");
    await expect(page.getByTestId("film-card").first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForFunction(() => window.scrollY >= 800);

    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);

    await page
      .getByRole("button", { name: "Add to watchlist" })
      .nth(2)
      .click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.getByTestId("email-auth-modal-close").click();
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(scrollBeforeOpen);
  });
});

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

test.describe("Films magic-link auth with Mailpit", () => {
  let magicLinkFlowSkipReason: string | null = null;

  test.beforeAll(async () => {
    magicLinkFlowSkipReason = await getMagicLinkFlowSkipReason();
  });

  test.beforeEach(async () => {
    test.skip(
      magicLinkFlowSkipReason !== null,
      magicLinkFlowSkipReason ?? "Mailpit magic-link prerequisites missing."
    );
  });

  test("opens the auth modal and requests a sign-in link", async ({ page }) => {
    const email = uniqueMagicLinkTestEmail("films-ui");

    await requestFilmsMagicLink(page, email);

    await expect(page.getByTestId("email-auth-sent-heading")).toHaveText(
      "Check your inbox"
    );
    await expect(page.getByText(/We sent a sign-in link to/)).toBeVisible();
    await expect(page.getByTestId("email-auth-change-email")).toBeVisible();
    await expect(page.getByTestId("email-auth-resend")).toBeVisible();
    await expect(page.getByTestId("email-auth-otp")).toHaveCount(0);
  });

  test("emails a valid auth callback link via Mailpit", async ({ page }) => {
    const email = uniqueMagicLinkTestEmail("films-link-shape");
    const sentAfter = await requestFilmsMagicLink(page, email);
    const { waitForMailpitMagicLink } = await import("../helpers/mailpit");
    const confirmationUrl = await waitForMailpitMagicLink({ email, sentAfter });

    expect(confirmationUrl).not.toMatch(/^https?:\/\/[^/?#]+&/);
    expect(confirmationUrl).toMatch(/\/auth\/callback\?/);
    expect(confirmationUrl).toMatch(/token_hash=/);
    expect(confirmationUrl).toMatch(/type=(email|signup)/);
  });

  test("retrieves the magic link from Mailpit and completes sign-in", async ({
    page,
  }) => {
    const credentials = getProfileTestCredentials();
    test.skip(
      credentials === null,
      "Missing E2E_PROFILE_SLUG and E2E_PROFILE_TOKEN (see ENV.md)."
    );

    const email = uniqueMagicLinkTestEmail("films-sign-in");
    const sentAfter = await requestFilmsMagicLink(page, email);
    const confirmationUrl = await completeFilmsMagicLinkSignIn(
      page,
      email,
      sentAfter
    );

    expect(confirmationUrl).toMatch(/\/auth\/callback\?.*token_hash=.*type=(email|signup)/);
    await expect(page).toHaveURL(profileGuideUrlPattern(credentials!.slug));
    expect(page.url()).toContain(profilePagePath(credentials!));
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(page.getByTestId("auth-status")).not.toContainText("Log in");
  });
});
