import { test, expect } from "@playwright/test";
import { expandFilmSearch, filmTitleFromCard } from "../helpers/profile-page";

test.describe("Public films catalog", () => {
  test("loads without a profile token and shows interactive film cards", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/films");

    await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
    await expect(page.getByTestId("film-search-expand")).toBeVisible();
    await expect(page.getByTestId("film-list")).toBeVisible();
    await expect(page.getByTestId("film-card").first()).toBeVisible();
    await expect(
      page
        .getByTestId("film-card")
        .filter({ has: page.getByTestId("film-technique-pill") })
        .first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rate 1 out of 10" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add to watchlist" }).first()
    ).toBeVisible();
    await expect(page.getByTestId("nav-saved")).toBeVisible();
    await expect(page.getByTestId("nav-watched")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "All", exact: true })
    ).toHaveAttribute("aria-pressed", "true");

    expect(consoleErrors).toEqual([]);
  });

  test("opens auth when a guest opens Saved or Watched", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("nav-saved").click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await page.getByTestId("nav-watched").click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();
  });

  test("supports search without profile context", async ({ page }) => {
    await page.goto("/films");

    const searchInput = await expandFilmSearch(page);
    const firstTitle = await filmTitleFromCard(page.getByTestId("film-card").first());
    // Prefer a distinctive substring — leading articles normalize away in search.
    const distinctive = firstTitle
      .replace(/^(the|a|an)\s+/i, "")
      .trim()
      .slice(0, Math.min(5, firstTitle.length));
    const partialTitle =
      distinctive.length >= 2 ? distinctive : firstTitle.slice(-4);

    await searchInput.fill(partialTitle);
    await expect(page.getByTestId("film-search-results")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page
        .getByTestId("film-search-results")
        .getByRole("button", { name: `Copy ${firstTitle}` })
    ).toBeVisible();
  });

  test.describe("search suggestion dismiss", () => {
    async function openSuggestionsOnFilms(page: import("@playwright/test").Page) {
      await page.goto("/films");

      const searchInput = await expandFilmSearch(page);
      const firstTitle = await filmTitleFromCard(
        page.getByTestId("film-card").first()
      );
      const distinctive = firstTitle
        .replace(/^(the|a|an)\s+/i, "")
        .trim()
        .slice(0, Math.min(5, firstTitle.length));
      const partialTitle =
        distinctive.length >= 2 ? distinctive : firstTitle.slice(-4);

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

      // Search replaces film-list with film-search-results.
      await page.getByTestId("film-search-results").click({
        position: { x: 8, y: 8 },
      });

      await expect(
        page.getByTestId("film-search-suggestions-dropdown")
      ).not.toBeVisible();
      await expect(searchInput).toHaveValue(partialTitle);
      await expect(page.getByTestId("film-search-results")).toBeVisible();
    });

    test("closes when scrolling and keeps results", async ({ page }) => {
      const { searchInput, partialTitle } = await openSuggestionsOnFilms(page);

      await page.evaluate(() => {
        // Local catalogs can be short; ensure a scroll event can fire.
        document.documentElement.style.minHeight = "2400px";
        window.scrollBy(0, 400);
      });

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
          .getByRole("button", { name: `Copy ${firstTitle}` })
      ).toBeVisible();
      expect(partialTitle.length).toBeGreaterThan(0);
    });
  });
});
