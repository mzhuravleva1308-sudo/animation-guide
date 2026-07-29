import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders the public catalog for guests", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");

    await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
    await expect(page.getByTestId("film-search-expand")).toBeVisible();
    await expect(page.getByTestId("film-list")).toBeVisible();
    await expect(page.getByTestId("auth-status")).toHaveAttribute(
      "aria-label",
      "Log in"
    );
    expect(consoleErrors).toEqual([]);
  });
});
