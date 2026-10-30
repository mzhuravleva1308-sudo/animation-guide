import { test, expect } from "@playwright/test";

test.describe("Films magic-link auth", () => {
  test("shows a guest account menu with guides, festivals, and login", async ({
    page,
  }) => {
    await page.goto("/films");

    await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
    await expect(page.getByTestId("account-menu-trigger")).toHaveAttribute(
      "aria-label",
      "Account menu"
    );

    await page.getByTestId("account-menu-trigger").click();
    await expect(page.getByTestId("account-menu-dropdown")).toBeVisible();
    await expect(page.getByTestId("account-menu-guides")).toHaveAttribute(
      "href",
      "/guides"
    );
    await expect(page.getByTestId("account-menu-festivals")).toHaveAttribute(
      "href",
      "/festivals"
    );
    await expect(page.getByTestId("account-menu-login")).toBeVisible();
  });

  test("closes the modal with Escape and overlay click", async ({ page }) => {
    await page.goto("/films");
    await expect(page.getByTestId("film-list")).toBeVisible();
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("account-menu-login").click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("account-menu-login").click();
    await page.getByTestId("email-auth-modal-overlay").click({
      position: { x: 8, y: 8 },
    });
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);
  });

  test("preserves scroll position when the auth modal closes", async ({ page }) => {
    await page.goto("/films");
    await expect(page.getByTestId("film-card").first()).toBeVisible();

    const watchlistButton = page
      .getByRole("button", { name: "Add to watchlist" })
      .last();
    await watchlistButton.scrollIntoViewIfNeeded();
    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);
    expect(scrollBeforeOpen).toBeGreaterThan(0);

    await watchlistButton.click();
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

    const watchlistButton = page
      .getByRole("button", { name: "Add to watchlist" })
      .last();
    await watchlistButton.scrollIntoViewIfNeeded();
    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);
    expect(scrollBeforeOpen).toBeGreaterThan(0);

    await watchlistButton.click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.getByTestId("email-auth-modal-close").click();
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(scrollBeforeOpen);
  });
});
