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
    await expect(page.getByTestId("nav-saved")).toHaveCount(0);
    await expect(page.getByTestId("nav-watched")).toHaveCount(0);
    await expect(page.getByTestId("nav-animation")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("nav-films")).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("can pick an animation technique from the Stop motion filter", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Stop motion" })).toBeVisible();
    await page.getByTestId("technique-filter-menu-trigger").click();

    const menu = page.getByTestId("technique-filter-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Hand-drawn" })).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Rotoscope" })).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Watercolor" })).toBeVisible();

    const viewport = page.viewportSize();
    const menuBox = await menu.boundingBox();
    expect(viewport).toBeTruthy();
    expect(menuBox).toBeTruthy();
    if (viewport && menuBox) {
      expect(menuBox.x).toBeGreaterThanOrEqual(-1);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(menuBox.y).toBeGreaterThanOrEqual(0);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height + 1);
    }

    await page.getByTestId("technique-filter-option-rotoscope").click();

    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rotoscope" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("quick-filter-description")).toHaveText(
      "Animation drawn over filmed movement."
    );
  });

  test("guests do not see Saved or Watched nav", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("nav-saved")).toHaveCount(0);
    await expect(page.getByTestId("nav-watched")).toHaveCount(0);
    await expect(page.getByTestId("auth-status")).toBeVisible();
  });

  test("guest can open Films and is prompted to log in on rate or save", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("nav-films")).toBeVisible();
    await page.getByTestId("nav-films").click();
    await expect(page.getByTestId("nav-films")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(
      page.getByText(
        "Find distinctive, beautiful and emotionally resonant films to watch next."
      )
    ).toBeVisible();
    await expect(page.getByTestId("film-card").first()).toBeVisible();

    await page.getByRole("button", { name: "Rate 1 out of 10" }).first().click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await page.getByRole("button", { name: "Add to watchlist" }).first().click();
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
