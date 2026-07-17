import { test, expect } from "@playwright/test";
import {
  assertFilmRatingInProfile,
  assertFilmSavedInProfile,
  countRatingRowsForFilm,
  countSavedListRowsForFilm,
  linkAuthUserEmailToE2eProfile,
  prepareE2eFilmsAuthProfile,
} from "../helpers/e2e-auth-profile";
import {
  completeFilmsMagicLinkSignIn,
  getMagicLinkFlowSkipReason,
  profileGuideUrlPattern,
  requestFilmsMagicLink,
  uniqueMagicLinkTestEmail,
} from "../helpers/magic-link-auth";
import {
  getProfileTestCredentials,
  profilePagePath,
  requireProfileTestCredentials,
} from "../helpers/profile-credentials";
import {
  firstFilmCard,
  openProfileTab,
  waitForWatchlistButton,
} from "../helpers/profile-page";

async function openAuthModalFromSaveAction(page: import("@playwright/test").Page) {
  const card = firstFilmCard(page);
  const saveButton = await waitForWatchlistButton(card, "Add to watchlist");
  await saveButton.click();
  await expect(page.getByTestId("email-auth-modal")).toBeVisible();
}

async function completeFilmsAuthFromOpenModal(
  page: import("@playwright/test").Page,
  email: string
) {
  await page.getByTestId("email-auth-email").fill(email);
  const sentAfter = new Date();
  await page.getByTestId("email-auth-continue").click();
  await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });
  await completeFilmsMagicLinkSignIn(page, email, sentAfter);
}

test.describe.configure({ mode: "serial" });

test.describe("Films pending actions with Mailpit", () => {
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

  test("signed-out save opens auth, persists to the authenticated profile, and opens the personal guide", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("films-save");
    const profileId = await prepareE2eFilmsAuthProfile(email);
    const credentials = requireProfileTestCredentials();

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await openAuthModalFromSaveAction(page);
    await completeFilmsAuthFromOpenModal(page, email);

    await expect(page).toHaveURL(profileGuideUrlPattern(credentials.slug));
    expect(page.url()).toContain(profilePagePath(credentials));
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();

    await openProfileTab(page, "Saved");
    const savedCard = firstFilmCard(page);
    await expect
      .poll(async () => countSavedListRowsForFilm(profileId, filmId!))
      .toBe(1);
    await expect(
      savedCard.getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();

    await assertFilmSavedInProfile(profileId, filmId!, true);
    expect(await countSavedListRowsForFilm(profileId, filmId!)).toBe(1);
  });

  test("signed-out rating opens auth, persists the selected rating, and opens the personal guide", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("films-rate");
    const profileId = await prepareE2eFilmsAuthProfile(email);
    const credentials = requireProfileTestCredentials();
    const rating = 8;

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await firstCard.getByRole("button", { name: `Rate ${rating} out of 10` }).click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await completeFilmsAuthFromOpenModal(page, email);

    await expect(page).toHaveURL(profileGuideUrlPattern(credentials.slug));
    expect(page.url()).toContain(profilePagePath(credentials));
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);

    await expect
      .poll(async () => countRatingRowsForFilm(profileId, filmId!))
      .toBe(1);

    await openProfileTab(page, "Watched");
    const ratedCard = page.locator(`[data-testid="film-card"][data-film-id="${filmId}"]`);
    await expect(ratedCard).toContainText(`My rating: ${rating}/10`);
    await assertFilmRatingInProfile(profileId, filmId!, rating);
    expect(await countRatingRowsForFilm(profileId, filmId!)).toBe(1);
  });

  test("closing the auth modal does not write pending save or rating actions", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("films-cancel");
    const profileId = await prepareE2eFilmsAuthProfile(email);

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await openAuthModalFromSaveAction(page);
    await page.getByTestId("email-auth-modal-close").click();
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);
    await expect(
      firstCard.getByRole("button", { name: "Add to watchlist" })
    ).toBeVisible();
    await assertFilmSavedInProfile(profileId, filmId!, false);

    await firstCard.getByRole("button", { name: "Rate 7 out of 10" }).click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);
    await expect(firstCard.getByText(/My rating: \d+\/10/)).toHaveCount(0);
    await assertFilmRatingInProfile(profileId, filmId!, null);
  });

  test("reloading after post-auth completion does not duplicate saved-list or rating writes", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("films-idempotent");
    const profileId = await prepareE2eFilmsAuthProfile(email);
    const credentials = requireProfileTestCredentials();
    const rating = 9;

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await openAuthModalFromSaveAction(page);
    await completeFilmsAuthFromOpenModal(page, email);

    await expect(page).toHaveURL(profileGuideUrlPattern(credentials.slug));

    await openProfileTab(page, "Saved");
    await expect
      .poll(async () => countSavedListRowsForFilm(profileId, filmId!))
      .toBe(1);
    await expect(
      firstFilmCard(page).getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(profileGuideUrlPattern(credentials.slug));
    await openProfileTab(page, "Saved");
    await expect(
      firstFilmCard(page).getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();
    expect(await countSavedListRowsForFilm(profileId, filmId!)).toBe(1);

    await openProfileTab(page, "All films");
    const allFilmsCard = page.locator(`[data-testid="film-card"][data-film-id="${filmId}"]`);
    await allFilmsCard.getByRole("button", { name: `Rate ${rating} out of 10` }).click();
    await expect
      .poll(async () => countRatingRowsForFilm(profileId, filmId!))
      .toBe(1);

    await openProfileTab(page, "Watched");
    await expect(
      page.locator(`[data-testid="film-card"][data-film-id="${filmId}"]`)
    ).toContainText(`My rating: ${rating}/10`);

    await page.reload();
    await openProfileTab(page, "Watched");
    await expect(
      page.locator(`[data-testid="film-card"][data-film-id="${filmId}"]`)
    ).toContainText(`My rating: ${rating}/10`);
    await assertFilmRatingInProfile(profileId, filmId!, rating);
    expect(await countRatingRowsForFilm(profileId, filmId!)).toBe(1);
  });

  test("existing user login without onboarding returns to the original page", async ({
    page,
  }) => {
    const email = uniqueMagicLinkTestEmail("existing-login");
    await linkAuthUserEmailToE2eProfile(email);

    const sentAfter = await requestFilmsMagicLink(page, email);
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: /\/films(?:\?|$)/,
    });

    await expect(page).toHaveURL(/\/films(?:\?|$)/);
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
  });
});
