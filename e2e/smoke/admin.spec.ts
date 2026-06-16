import { test, expect } from "@playwright/test";

test.describe("Admin pages", () => {
  test("import page renders the form shell", async ({ page }) => {
    await page.goto("/admin/import");

    await expect(
      page.getByRole("heading", { name: "Import film" })
    ).toBeVisible();
    await expect(page.getByLabel("Source text")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate draft" })
    ).toBeVisible();
  });

  test("new film page renders the manual entry form", async ({ page }) => {
    await page.goto("/admin/new");

    await expect(page.getByRole("heading", { name: "Add film" })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Title", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save film" })).toBeVisible();
  });
});
