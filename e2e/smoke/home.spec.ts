import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders the landing page without crashing", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Animation Guide" })
    ).toBeVisible();
    await expect(
      page.getByText("Personal animation guides are available by private link.")
    ).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
