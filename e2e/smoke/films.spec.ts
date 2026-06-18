import { test, expect } from "@playwright/test";
import {
  requireProfileTestCredentials,
  type ProfileTestCredentials,
} from "../helpers/profile-credentials";
import {
  filmCards,
  gotoProfilePage,
  openProfileTab,
} from "../helpers/profile-page";
import { resetE2eProfile } from "../helpers/reset-e2e-profile";
import { getFirstFilmTitleByIdOrder } from "../helpers/film-catalog-order";

async function getVisibleFilmTitles(page: import("@playwright/test").Page) {
  return filmCards(page).evaluateAll((cards) =>
    cards
      .map((card) => card.querySelector("h2")?.textContent?.trim() ?? "")
      .filter(Boolean)
  );
}

test.describe("Public films catalog", () => {
  test("loads without a profile token and shows read-only film cards", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/films");

    await expect(
      page.getByRole("heading", { name: "Animation Guide" })
    ).toBeVisible();
    await expect(page.getByTestId("film-search-input")).toBeVisible();
    await expect(page.getByTestId("film-list")).toBeVisible();
    await expect(page.getByTestId("film-card").first()).toBeVisible();

    await expect(page.getByText("My rating:")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add to watchlist" })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "All films" })).toHaveCount(
      0
    );
    await expect(page.getByRole("button", { name: "Saved" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Watched" })).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });

  test("supports search without profile context", async ({ page }) => {
    await page.goto("/films");

    const searchInput = page.getByTestId("film-search-input");
    const firstTitle = await page
      .getByTestId("film-card")
      .first()
      .getByRole("heading", { level: 2 })
      .innerText();
    const partialTitle = firstTitle.slice(0, Math.min(4, firstTitle.length));

    await searchInput.fill(partialTitle);
    await expect(page.getByTestId("film-search-results")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page
        .getByTestId("film-search-results")
        .getByRole("heading", { level: 2, name: firstTitle })
    ).toBeVisible();
  });

  test.describe("search suggestion dismiss", () => {
    async function openSuggestionsOnFilms(page: import("@playwright/test").Page) {
      await page.goto("/films");

      const searchInput = page.getByTestId("film-search-input");
      const firstTitle = await page
        .getByTestId("film-card")
        .first()
        .getByRole("heading", { level: 2 })
        .innerText();
      const partialTitle = firstTitle.slice(0, Math.min(4, firstTitle.length));

      await searchInput.fill(partialTitle);

      await expect(page.getByTestId("film-search-suggestions-dropdown")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("film-search-results")).toBeVisible({
        timeout: 10_000,
      });

      return { searchInput, partialTitle, firstTitle };
    }

    test("closes on Escape and keeps the typed query and results", async ({
      page,
    }) => {
      const { searchInput, partialTitle } = await openSuggestionsOnFilms(page);

      await searchInput.press("Escape");

      await expect(
        page.getByTestId("film-search-suggestions-dropdown")
      ).not.toBeVisible();
      await expect(searchInput).toHaveValue(partialTitle);
      await expect(page.getByTestId("film-search-results")).toBeVisible();
    });

    test("closes on outside click and keeps results", async ({ page }) => {
      const { searchInput, partialTitle } = await openSuggestionsOnFilms(page);

      await page.getByRole("heading", { name: "Animation Guide" }).click();

      await expect(
        page.getByTestId("film-search-suggestions-dropdown")
      ).not.toBeVisible();
      await expect(searchInput).toHaveValue(partialTitle);
      await expect(page.getByTestId("film-search-results")).toBeVisible();
    });

    test("closes when scrolling and keeps results", async ({ page }) => {
      const { searchInput, partialTitle } = await openSuggestionsOnFilms(page);

      await page.evaluate(() => window.scrollBy(0, 200));

      await expect(
        page.getByTestId("film-search-suggestions-dropdown")
      ).not.toBeVisible();
      await expect(searchInput).toHaveValue(partialTitle);
      await expect(page.getByTestId("film-search-results")).toBeVisible();
    });

    test("still applies a suggestion click", async ({ page }) => {
      const { searchInput, partialTitle, firstTitle } =
        await openSuggestionsOnFilms(page);

      await page
        .getByTestId("film-search-suggestion-item")
        .filter({ hasText: firstTitle })
        .first()
        .click();

      await expect(searchInput).toHaveValue(firstTitle);
      await expect(
        page.getByTestId("film-search-suggestions-dropdown")
      ).not.toBeVisible();
      await expect(page.getByTestId("film-search-results")).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page
          .getByTestId("film-search-results")
          .getByRole("heading", { level: 2, name: firstTitle })
      ).toBeVisible();
      expect(partialTitle.length).toBeGreaterThan(0);
    });
  });

  test.describe("cold-start catalog order", () => {
    test.describe.configure({ mode: "serial" });

    let credentials: ProfileTestCredentials;
    let resetFailed = false;
    let resetFailureMessage = "";

    test.beforeAll(async () => {
      credentials = requireProfileTestCredentials();

      try {
        await resetE2eProfile(credentials);
      } catch (error) {
        resetFailed = true;
        resetFailureMessage =
          error instanceof Error ? error.message : "E2E profile reset failed.";
      }
    });

    test.afterAll(async () => {
      if (resetFailed) {
        return;
      }

      await resetE2eProfile(credentials);
    });

    test.beforeEach(async () => {
      test.skip(
        resetFailed,
        resetFailureMessage || "E2E profile reset failed in beforeAll."
      );

      await resetE2eProfile(credentials);
    });

    test("first page matches profile cold-start order, not raw ID order", async ({
      page,
    }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const profileTitles = await getVisibleFilmTitles(page);
      expect(profileTitles.length).toBeGreaterThan(0);

      await page.goto("/films");
      await expect(page.getByTestId("film-list")).toBeVisible();

      const catalogTitles = await getVisibleFilmTitles(page);
      expect(catalogTitles.length).toBeGreaterThan(0);
      expect(catalogTitles.slice(0, 5)).toEqual(profileTitles.slice(0, 5));

      const lowestIdTitle = await getFirstFilmTitleByIdOrder();
      expect(catalogTitles[0]).not.toEqual(lowestIdTitle);
    });
  });
});
