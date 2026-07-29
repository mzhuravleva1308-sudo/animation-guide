import { test, expect } from "@playwright/test";
import type { ProfileTestCredentials } from "../helpers/profile-credentials";
import {
  ensureProjectE2eProfile,
} from "../helpers/project-profile-credentials";
import {
  ensureProjectRatingAuthUser,
  signInProjectRatingUser,
} from "../helpers/project-profile-auth";
import { countRatingRowsForFilm } from "../helpers/e2e-auth-profile";
import { getSmokeRatingFilmForProject } from "../helpers/film-catalog-order";
import {
  expectTabHasFilms,
  expectTabIsEmpty,
  filmCardByFilmId,
  filmCardByTitle,
  filmCards,
  filmList,
  filmTitleFromCard,
  findFilmCardInAllFilmsList,
  firstFilmCard,
  firstUnratedFilmCard,
  gotoProfilePage,
  openProfileTab,
  expandFilmSearch,
  rateFilmOnCard,
  unsaveAllVisibleFilms,
  waitForWatchlistButton,
} from "../helpers/profile-page";
import {
  resetE2eProfile,
  resetE2eProfileFilmRating,
} from "../helpers/reset-e2e-profile";
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
    let profileId: string;
    let resetFailed = false;
    let resetFailureMessage = "";

    test.beforeAll(async ({}, testInfo) => {
      try {
        credentials = await ensureProjectE2eProfile(testInfo.project.name);
        profileId = await resetE2eProfile(credentials);
        await ensureProjectRatingAuthUser(testInfo.project.name);
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

      profileId = await resetE2eProfile(credentials);
    });

    test("loads film cards and tab navigation for a valid share link", async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => consoleErrors.push(error.message));

      await gotoProfilePage(page, credentials);

      await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
      await expect(page.getByRole("button", { name: "All" })).toBeVisible();
      await expect(page.getByRole("button", { name: "All" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Watched" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Films" })).toHaveCount(0);

      await expect(filmList(page)).toBeVisible();
      await expectTabHasFilms(page);
      await expect(
        filmCards(page).first().getByRole("button", { name: "Rate 1 out of 10" })
      ).toBeVisible();

      await openProfileTab(page, "Saved");
      await expectTabIsEmpty(page);

      await openProfileTab(page, "Watched");
      await expectTabIsEmpty(page);

      await openProfileTab(page, "All films");
      await expectTabHasFilms(page);

      expect(consoleErrors).toEqual([]);
    });

    test("rating a film updates the card UI", async ({ page }, testInfo) => {
      const rating = 8;
      const smokeRatingFilm = await getSmokeRatingFilmForProject(
        testInfo.project.name
      );
      await resetE2eProfileFilmRating(credentials, smokeRatingFilm.id);

      await signInProjectRatingUser(page, testInfo.project.name);
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const card = await findFilmCardInAllFilmsList(page, smokeRatingFilm.id);
      await expect(
        card.getByRole("button", { name: `Rate ${rating} out of 10` })
      ).toBeVisible();

      await rateFilmOnCard(card, rating);
      await expect(page.getByTestId("toast")).toContainText(
        "Saved to Watched and added to your taste profile."
      );

      await expect(
        filmList(page).locator(
          `[data-testid="film-card"][data-film-id="${smokeRatingFilm.id}"]`
        )
      ).toHaveCount(0);

      await openProfileTab(page, "Watched");
      const watchedCard = filmCardByFilmId(page, smokeRatingFilm.id);
      await expect(watchedCard.getByText(`My rating: ${rating}/10`)).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        watchedCard.getByRole("button", { name: `Rate ${rating} out of 10` })
      ).toHaveAttribute("aria-pressed", "true");

      await expect
        .poll(async () => countRatingRowsForFilm(profileId, smokeRatingFilm.id))
        .toBe(1);

      await page.reload();
      await openProfileTab(page, "Watched");
      const reloadedWatchedCard = filmCardByFilmId(page, smokeRatingFilm.id);
      await expect(reloadedWatchedCard.getByText(`My rating: ${rating}/10`)).toBeVisible();
      await expect(
        reloadedWatchedCard.getByRole("button", { name: `Rate ${rating} out of 10` })
      ).toHaveAttribute("aria-pressed", "true");

      await rateFilmOnCard(reloadedWatchedCard, rating);
      await expect(page.getByTestId("toast")).toContainText(
        "Rating removed and no longer affects your taste profile."
      );
      await expect(reloadedWatchedCard).not.toBeVisible();
      await expect
        .poll(async () => countRatingRowsForFilm(profileId, smokeRatingFilm.id))
        .toBe(0);
      await resetE2eProfileFilmRating(credentials, smokeRatingFilm.id);
    });

    test("share-token profile can save a rating without login", async ({
      page,
    }, testInfo) => {
      const rating = 6;
      const smokeRatingFilm = await getSmokeRatingFilmForProject(
        testInfo.project.name
      );
      await resetE2eProfileFilmRating(credentials, smokeRatingFilm.id);
      let releaseRequest!: () => void;
      const requestReleased = new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      await page.route("**/api/profile-rating", async (route) => {
        await requestReleased;
        await route.continue();
      });

      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const card = await findFilmCardInAllFilmsList(page, smokeRatingFilm.id);
      await rateFilmOnCard(card, rating);

      await expect(page.getByTestId("toast")).toContainText(
        "Saved to Watched and added to your taste profile."
      );
      releaseRequest();
      await expect
        .poll(async () => countRatingRowsForFilm(profileId, smokeRatingFilm.id))
        .toBe(1);

      await resetE2eProfileFilmRating(credentials, smokeRatingFilm.id);
    });

    test("rating failure rolls back the optimistic UI", async ({
      page,
    }, testInfo) => {
      const smokeRatingFilm = await getSmokeRatingFilmForProject(
        testInfo.project.name
      );
      await resetE2eProfileFilmRating(credentials, smokeRatingFilm.id);
      await page.route("**/api/profile-rating", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "save failed" }),
        });
      });

      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");
      const card = await findFilmCardInAllFilmsList(page, smokeRatingFilm.id);
      await rateFilmOnCard(card, 6);

      await expect(page.getByTestId("toast")).toContainText(
        "Couldn’t save your changes. Please try again."
      );
      const restoredCard = await findFilmCardInAllFilmsList(
        page,
        smokeRatingFilm.id
      );
      await expect(
        restoredCard.getByRole("button", { name: "Rate 6 out of 10" })
      ).toHaveAttribute("aria-pressed", "false");
    });

    test('rated film leaves the "All films" queue', async ({ page }, testInfo) => {
      await signInProjectRatingUser(page, testInfo.project.name);
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const card = firstUnratedFilmCard(page);
      const filmTitle = await filmTitleFromCard(card);

      await rateFilmOnCard(card, 7);

      await expect(filmCardByTitle(page, filmTitle)).toHaveCount(0);

      await openProfileTab(page, "Watched");
      await expect(filmCardByTitle(page, filmTitle)).toBeVisible();

      await rateFilmOnCard(filmCardByTitle(page, filmTitle), 7);
      await expect(filmCardByTitle(page, filmTitle)).not.toBeVisible();

      await openProfileTab(page, "All films");
      await expect(filmCardByTitle(page, filmTitle)).toBeVisible();
    });

    test("save to Saved tab and unsave round trip", async ({ page }) => {
      let releaseRequest!: () => void;
      const requestReleased = new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      await page.route("**/api/profile-save", async (route) => {
        await requestReleased;
        await route.continue();
      });

      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const card = firstFilmCard(page);
      const filmTitle = await filmTitleFromCard(card);
      const saveButton = await waitForWatchlistButton(card, "Add to watchlist");

      await saveButton.click();
      await expect(
        card.getByRole("button", { name: "Remove from watchlist" })
      ).toBeVisible();
      await expect(page.getByTestId("toast")).toContainText(
        "Saved for later. You can find it in Saved."
      );
      releaseRequest();

      await openProfileTab(page, "Saved");
      await expectTabHasFilms(page, 1);
      await expect(filmCardByTitle(page, filmTitle)).toBeVisible();

      await unsaveAllVisibleFilms(page);
    });

    test("Saved failure rolls back the optimistic UI", async ({ page }) => {
      await page.route("**/api/profile-save", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "save failed" }),
        });
      });

      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");
      const card = firstFilmCard(page);
      const saveButton = await waitForWatchlistButton(card, "Add to watchlist");
      await saveButton.click();

      await expect(page.getByTestId("toast")).toContainText(
        "Couldn’t save your changes. Please try again."
      );
      await expect(
        card.getByRole("button", { name: "Add to watchlist" })
      ).toBeVisible();
    });

    test("empty Saved tab shows correct empty state", async ({ page }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "Saved");
      await expectTabIsEmpty(page);
    });

    test("shows film database search UI only on All films tab", async ({ page }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      await expect(page.getByTestId("film-search-expand")).toBeVisible();

      await openProfileTab(page, "Saved");
      await expect(page.getByTestId("film-search-expand")).not.toBeVisible();
      await expect(page.getByTestId("film-search-input")).not.toBeVisible();

      await openProfileTab(page, "All films");
      const searchInput = await expandFilmSearch(page);
      await expect(searchInput).toBeVisible();

      await searchInput.fill("a");
      await expect(page.getByTestId("film-search-hint")).toBeVisible();

      const firstTitle = await filmTitleFromCard(firstFilmCard(page));
      const partialTitle = firstTitle.slice(0, Math.min(4, firstTitle.length));

      await searchInput.fill(partialTitle);
      await expect(page.getByTestId("film-search-results")).toBeVisible();
      await expect(
        page
          .getByTestId("film-search-results")
          .getByRole("button", { name: `Copy ${firstTitle}` })
      ).toBeVisible();
    });

    test("shows typeahead suggestions while typing and runs search on click", async ({
      page,
    }) => {
      await gotoProfilePage(page, credentials);
      await openProfileTab(page, "All films");

      const searchInput = await expandFilmSearch(page);
      const firstTitle = await filmTitleFromCard(firstFilmCard(page));
      const partialTitle = firstTitle.slice(0, Math.min(4, firstTitle.length));

      await searchInput.fill(partialTitle);

      const dropdown = page.getByTestId("film-search-suggestions-dropdown");
      await expect(dropdown).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("film-search-suggestion-item").first()).toBeVisible();

      await page
        .getByTestId("film-search-suggestion-item")
        .filter({ hasText: firstTitle })
        .first()
        .click();

      await expect(searchInput).toHaveValue(firstTitle);
      await expect(dropdown).not.toBeVisible();
      await expect(page.getByTestId("film-search-results")).toBeVisible({
        timeout: 10_000,
      });

      await searchInput.fill("");
      await expect(dropdown).not.toBeVisible();
    });

    test("keeps trailer overlay compact and centered on the poster", async ({
      page,
    }) => {
      await gotoProfilePage(page, credentials);

      const cardWithTrailer = firstFilmCardWithTrailer(page, filmCards(page));
      await expect(cardWithTrailer).toBeVisible();

      await page.setViewportSize({ width: 1280, height: 800 });
      await expectTrailerOverlayLayout(cardWithTrailer, {
        maxWidthRatio: 0.48,
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
