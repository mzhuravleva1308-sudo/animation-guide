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

  test("catalog analytics route renders coverage dashboard", async ({ page }) => {
    await page.goto("/admin/catalog-analytics");

    await expect(
      page.getByRole("heading", { name: "Catalog analytics" })
    ).toBeVisible();
    await expect(page.getByText("Total films")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Country coverage" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Suggested curation gaps" })
    ).toBeVisible();
  });

  test("festival recognitions route renders festival QA tabs", async ({ page }) => {
    await page.goto("/admin/festival-recognitions");

    await expect(
      page.getByRole("heading", { name: "Festival recognitions" })
    ).toBeVisible();
    await expect(page.getByText("film_festival_claims")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /All candidates/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Annecy candidates/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Confirmed Annecy/i })
    ).toBeVisible();
  });
});
