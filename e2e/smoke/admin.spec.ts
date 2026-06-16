import { test, expect } from "@playwright/test";

test.describe("Admin pages", () => {
  test("import route shows deprecation notice", async ({ page }) => {
    await page.goto("/admin/import");

    await expect(
      page.getByRole("heading", { name: "Manual film import disabled" })
    ).toBeVisible();
    await expect(page.getByText("controlled import pipeline")).toBeVisible();
  });

  test("new film route shows deprecation notice", async ({ page }) => {
    await page.goto("/admin/new");

    await expect(
      page.getByRole("heading", { name: "Manual film import disabled" })
    ).toBeVisible();
    await expect(page.getByText("deprecated")).toBeVisible();
  });
});
