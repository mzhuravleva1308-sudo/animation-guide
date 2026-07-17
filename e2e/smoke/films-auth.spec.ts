import { test, expect } from "@playwright/test";

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

    const watchlistButton = page
      .getByRole("button", { name: "Add to watchlist" })
      .nth(2);
    await watchlistButton.scrollIntoViewIfNeeded();
    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);

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

    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForFunction(() => window.scrollY >= 800);

    const watchlistButton = page
      .getByRole("button", { name: "Add to watchlist" })
      .nth(2);
    await watchlistButton.scrollIntoViewIfNeeded();
    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);

    await watchlistButton.click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.getByTestId("email-auth-modal-close").click();
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(scrollBeforeOpen);
  });
});
