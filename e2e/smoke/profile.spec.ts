import { test, expect } from "@playwright/test";
import {
  requireProfileTestCredentials,
  type ProfileTestCredentials,
} from "../helpers/profile-credentials";
import {
  expectTabHasFilms,
  expectTabIsEmpty,
  filmCardByTitle,
  filmCards,
  filmList,
  firstFilmCard,
  firstUnratedFilmCard,
  gotoProfilePage,
  openProfileTab,
  rateFilmOnCard,
  unsaveAllVisibleFilms,
  waitForWatchlistButton,
} from "../helpers/profile-page";
import { resetE2eProfile } from "../helpers/reset-e2e-profile";
import {
  expectTrailerOverlayLayout,
  firstFilmCardWithTrailer,
} from "../helpers/film-card-layout";

test.describe("Profile page", () => {
  test("shows a friendly message for invalid share links", async ({ page }) => {
    await page.goto("/p/invalid-slug?token=invalid-token");

    await expect(
      page.getByRole("heading", { name: "Profile not found" })
    ).toBeVisible();
    await expect(
      page.getByText("This profile is private or the link is invalid.")
    ).toBeVisible();
  });

  test.describe("authenticated E2E profile", () => {
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

    test("loads film cards and tab navigation for a valid share link", async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => consoleErrors.push(error.message));

      await gotoProfilePage(page, credentials);

      await expect(
        page.getByRole("button", { name: "All films" })
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Watched" })).toBeVisible();

      await expect(filmList(page)).toBeVisible();
      await expectTabHasFilms(page);
      await expect(filmCards(page).first().getByText("My rating:")).toBeVisible();

      await openProfileTab(page, "Saved");
      await expectTabIsEmpty(page);

      await openProfileTab(page, "Watched");
      await expectTabIsEmpty(page);

      await openProfileTab(page, "All films");
      await expectTabHasFilms(page);

      expect(consoleErrors).toEqual([]);
    });

    test("rating a film updates the card UI", async ({ page }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const card = firstUnratedFilmCard(page);
      await expect(card.getByText("My rating: not rated yet")).toBeVisible();
      const filmTitle = await card
        .getByRole("heading", { level: 2 })
        .innerText();

      await rateFilmOnCard(card, 8);

      await expect(
        filmList(page).getByRole("heading", { level: 2, name: filmTitle })
      ).toHaveCount(0);

      await openProfileTab(page, "Watched");
      const watchedCard = filmCardByTitle(page, filmTitle);

      await expect(watchedCard.getByText("My rating: 8/10")).toBeVisible();
      await expect(
        watchedCard.getByRole("button", { name: "Rate 8 out of 10" })
      ).toHaveAttribute("aria-pressed", "true");

      await rateFilmOnCard(watchedCard, 8);
      await expect(watchedCard).not.toBeVisible();
    });

    test('rated film leaves the "All films" queue', async ({ page }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const card = firstUnratedFilmCard(page);
      const filmTitle = await card
        .getByRole("heading", { level: 2 })
        .innerText();

      await rateFilmOnCard(card, 7);

      await expect(
        filmList(page).getByRole("heading", { level: 2, name: filmTitle })
      ).toHaveCount(0);

      await openProfileTab(page, "Watched");
      await expect(filmCardByTitle(page, filmTitle)).toBeVisible();

      await rateFilmOnCard(filmCardByTitle(page, filmTitle), 7);
      await expect(filmCardByTitle(page, filmTitle)).not.toBeVisible();

      await openProfileTab(page, "All films");
      await expect(
        filmList(page).getByRole("heading", { level: 2, name: filmTitle })
      ).toBeVisible();
    });

    test("save to Saved tab and unsave round trip", async ({ page }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const card = firstFilmCard(page);
      const filmTitle = await card
        .getByRole("heading", { level: 2 })
        .innerText();
      const saveButton = await waitForWatchlistButton(card, "Add to watchlist");

      await saveButton.click();
      await expect(
        card.getByRole("button", { name: "Remove from watchlist" })
      ).toBeVisible();

      await openProfileTab(page, "Saved");
      await expectTabHasFilms(page, 1);
      await expect(
        filmList(page).getByRole("heading", { level: 2, name: filmTitle })
      ).toBeVisible();

      await unsaveAllVisibleFilms(page);
    });

    test("empty Saved tab shows correct empty state", async ({ page }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "Saved");
      await expectTabIsEmpty(page);
    });

    test("shows film database search UI only on All films tab", async ({ page }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const searchInput = page.getByTestId("film-search-input");
      await expect(searchInput).toBeVisible();

      await openProfileTab(page, "Saved");
      await expect(searchInput).not.toBeVisible();

      await openProfileTab(page, "All films");
      await expect(searchInput).toBeVisible();

      await searchInput.fill("a");
      await expect(page.getByTestId("film-search-hint")).toBeVisible();

      const firstTitle = await firstFilmCard(page)
        .getByRole("heading", { level: 2 })
        .innerText();
      const partialTitle = firstTitle.slice(0, Math.min(4, firstTitle.length));

      await searchInput.fill(partialTitle);
      await expect(page.getByTestId("film-search-results")).toBeVisible();
      await expect(
        page.getByTestId("film-search-results").getByRole("heading", {
          level: 2,
          name: firstTitle,
        })
      ).toBeVisible();
    });

    test("keeps trailer overlay compact and centered on the poster", async ({
      page,
    }) => {
      await gotoProfilePage(page, credentials);

      const cardWithTrailer = firstFilmCardWithTrailer(page, filmCards(page));
      await expect(cardWithTrailer).toBeVisible();

      await page.setViewportSize({ width: 1280, height: 800 });
      await expectTrailerOverlayLayout(cardWithTrailer, {
        maxWidthRatio: 0.45,
        maxHeight: 32,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await expectTrailerOverlayLayout(cardWithTrailer, {
        maxWidthRatio: 0.35,
        maxHeight: 32,
      });
    });
  });
});
