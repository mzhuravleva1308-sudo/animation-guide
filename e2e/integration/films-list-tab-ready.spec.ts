import { test, expect } from "@playwright/test";
import {
  linkAuthUserEmailToE2eProfile,
  prepareE2eFilmsAuthProfile,
  countRatingRowsForFilm,
  countSavedListRowsForFilm,
  findProfileIdForAuthEmail,
} from "../helpers/e2e-auth-profile";
import {
  completeFilmsMagicLinkSignIn,
  getMagicLinkFlowSkipReason,
  uniqueMagicLinkTestEmail,
} from "../helpers/magic-link-auth";
import {
  getProfileTestCredentials,
  requireProfileTestCredentials,
} from "../helpers/profile-credentials";
import {
  firstFilmCard,
  openProfileTab,
  tabEmptyState,
  waitForWatchlistButton,
} from "../helpers/profile-page";

test.describe.configure({ mode: "serial" });

test.describe("Films Saved/Watched list ready vs empty", () => {
  let magicLinkFlowSkipReason: string | null = null;
  let profileSkipReason: string | null = null;

  test.beforeAll(async () => {
    magicLinkFlowSkipReason = await getMagicLinkFlowSkipReason();
    profileSkipReason = getProfileTestCredentials()
      ? null
      : "Missing E2E_PROFILE_SLUG and E2E_PROFILE_TOKEN (see ENV.md).";
  });

  test.beforeEach(async () => {
    test.skip(
      magicLinkFlowSkipReason !== null,
      magicLinkFlowSkipReason ?? "Mailpit magic-link prerequisites missing."
    );
    test.skip(
      profileSkipReason !== null,
      profileSkipReason ?? "E2E profile credentials missing."
    );
  });

  test("does not show Watched/Saved empty state while lists are still loading", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("list-ready-loading");
    await linkAuthUserEmailToE2eProfile(email);
    requireProfileTestCredentials();

    const ratingsGate = (() => {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promise, release: () => release() };
    })();

    // Delay client revalidation only — SSR may already hydrate list state.
    await page.route("**/rest/v1/film_ratings*", async (route) => {
      await ratingsGate.promise;
      await route.continue();
    });
    await page.route("**/rest/v1/profile_film_lists*", async (route) => {
      await ratingsGate.promise;
      await route.continue();
    });

    const sentAfter = new Date();
    await page.goto("/");
    await page.getByTestId("auth-status").click();
    await page.getByTestId("email-auth-email").fill(email);
    await page.getByTestId("email-auth-continue").click();
    await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: (url) => new URL(url).pathname === "/",
    });

    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();

    await openProfileTab(page, "Watched");
    const watchedReady = await page
      .getByTestId("films-page")
      .getAttribute("data-ratings-ready");
    if (watchedReady === "false") {
      await expect(page.getByTestId("profile-tab-loading")).toBeVisible();
      await expect(tabEmptyState(page)).toHaveCount(0);
      await expect(page.getByText("No watched films yet.")).toHaveCount(0);
    } else {
      // SSR-hydrated lists: no loading gate; empty only if truly empty.
      await expect(page.getByTestId("profile-tab-loading")).toHaveCount(0);
    }

    await openProfileTab(page, "Saved");
    const savedReady = await page
      .getByTestId("films-page")
      .getAttribute("data-ratings-ready");
    if (savedReady === "false") {
      await expect(page.getByTestId("profile-tab-loading")).toBeVisible();
      await expect(tabEmptyState(page)).toHaveCount(0);
      await expect(page.getByText("No saved films yet.")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("profile-tab-loading")).toHaveCount(0);
    }

    ratingsGate.release();
    await expect(page.getByTestId("films-page")).toHaveAttribute(
      "data-ratings-ready",
      "true",
      { timeout: 15_000 }
    );
    await expect(page.getByTestId("profile-tab-loading")).toHaveCount(0);
  });

  test("shows true empty state only after lists are ready", async ({ page }) => {
    const email = uniqueMagicLinkTestEmail("list-ready-empty");
    await prepareE2eFilmsAuthProfile(email);

    const sentAfter = new Date();
    await page.goto("/");
    await page.getByTestId("auth-status").click();
    await page.getByTestId("email-auth-email").fill(email);
    await page.getByTestId("email-auth-continue").click();
    await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: (url) => new URL(url).pathname === "/",
    });

    await expect(page.getByTestId("films-page")).toHaveAttribute(
      "data-ratings-ready",
      "true",
      { timeout: 15_000 }
    );

    await openProfileTab(page, "Watched");
    await expect(page.getByTestId("profile-tab-loading")).toHaveCount(0);
    await expect(tabEmptyState(page)).toBeVisible();
    await expect(page.getByText("No watched films yet.")).toBeVisible();

    await openProfileTab(page, "Saved");
    await expect(page.getByTestId("profile-tab-loading")).toHaveCount(0);
    await expect(tabEmptyState(page)).toBeVisible();
    await expect(page.getByText("No saved films yet.")).toBeVisible();
  });

  test("pending guest rating appears in Watched without a false empty flash", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("list-ready-pending-rate");
    await prepareE2eFilmsAuthProfile(email);
    const rating = 8;

    await page.goto("/");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await firstCard
      .getByRole("button", { name: `Rate ${rating} out of 10` })
      .click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    const sentAfter = new Date();
    await page.getByTestId("email-auth-email").fill(email);
    await page.getByTestId("email-auth-continue").click();
    await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: (url) => new URL(url).pathname === "/",
    });

    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();

    // Open Watched immediately — loading skeleton is ok; false empty is not.
    await openProfileTab(page, "Watched");
    await expect
      .poll(async () => {
        if ((await tabEmptyState(page).count()) > 0) {
          return "empty";
        }
        if (
          (await page
            .locator(`[data-testid="film-card"][data-film-id="${filmId}"]`)
            .count()) > 0
        ) {
          return "film";
        }
        if ((await page.getByTestId("profile-tab-loading").count()) > 0) {
          return "loading";
        }
        return "other";
      })
      .not.toBe("empty");

    await expect(
      page.locator(`[data-testid="film-card"][data-film-id="${filmId}"]`)
    ).toBeVisible({ timeout: 15_000 });
    await expect(tabEmptyState(page)).toHaveCount(0);
    await expect(page.getByText("No watched films yet.")).toHaveCount(0);

    const profileId = await findProfileIdForAuthEmail(email);
    expect(profileId).toBeTruthy();
    await expect
      .poll(async () => countRatingRowsForFilm(profileId!, filmId!), {
        timeout: 15_000,
      })
      .toBe(1);
  });

  test("pending guest save appears in Saved without a false empty flash", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("list-ready-pending-save");
    await prepareE2eFilmsAuthProfile(email);

    await page.goto("/");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    const saveButton = await waitForWatchlistButton(firstCard, "Add to watchlist");
    await saveButton.click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    const sentAfter = new Date();
    await page.getByTestId("email-auth-email").fill(email);
    await page.getByTestId("email-auth-continue").click();
    await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: (url) => new URL(url).pathname === "/",
    });

    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await openProfileTab(page, "Saved");

    await expect
      .poll(async () => {
        if ((await tabEmptyState(page).count()) > 0) {
          return "empty";
        }
        if (
          (await page
            .locator(`[data-testid="film-card"][data-film-id="${filmId}"]`)
            .count()) > 0
        ) {
          return "film";
        }
        if ((await page.getByTestId("profile-tab-loading").count()) > 0) {
          return "loading";
        }
        return "other";
      })
      .not.toBe("empty");

    await expect(
      page.locator(`[data-testid="film-card"][data-film-id="${filmId}"]`)
    ).toBeVisible({ timeout: 15_000 });
    await expect(tabEmptyState(page)).toHaveCount(0);
    await expect(page.getByText("No saved films yet.")).toHaveCount(0);

    const profileId = await findProfileIdForAuthEmail(email);
    expect(profileId).toBeTruthy();
    await expect
      .poll(async () => countSavedListRowsForFilm(profileId!, filmId!), {
        timeout: 15_000,
      })
      .toBe(1);
  });
});
