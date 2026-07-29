import { test, expect } from "@playwright/test";

test.describe("Admin pages", () => {
  test("unauthenticated admin import redirects to login", async ({ page }) => {
    await page.goto("/admin/import");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated admin new redirects to login", async ({ page }) => {
    await page.goto("/admin/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated catalog analytics redirects to login", async ({
    page,
  }) => {
    await page.goto("/admin/catalog-analytics");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated festival recognitions redirects to login", async ({
    page,
  }) => {
    await page.goto("/admin/festival-recognitions");
    await expect(page).toHaveURL(/\/login/);
  });
});
