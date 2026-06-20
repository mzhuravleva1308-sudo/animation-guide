import { test, expect } from "@playwright/test";
import {
  assertFilmRatingInProfile,
  assertFilmSavedInProfile,
  countRatingRowsForFilm,
  countSavedListRowsForFilm,
  prepareE2eFilmsAuthProfile,
} from "../helpers/e2e-auth-profile";
import {
  completeFilmsEmailOtpSignIn,
  getEmailOtpFlowSkipReason,
  uniqueOtpTestEmail,
} from "../helpers/email-otp-auth";
import { getProfileTestCredentials } from "../helpers/profile-credentials";
import { firstFilmCard, waitForWatchlistButton } from "../helpers/profile-page";

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
  await page.getByTestId("email-auth-otp").waitFor({ timeout: 10_000 });
  await completeFilmsEmailOtpSignIn(page, email, sentAfter);
}

test.describe("Films pending actions with Mailpit", () => {
  let otpFlowSkipReason: string | null = null;
  let profileSkipReason: string | null = null;

  test.beforeAll(async () => {
    otpFlowSkipReason = await getEmailOtpFlowSkipReason();
    profileSkipReason = getProfileTestCredentials()
      ? null
      : "Missing E2E_PROFILE_SLUG and E2E_PROFILE_TOKEN in .env.local.";
  });

  test.beforeEach(async () => {
    test.skip(
      otpFlowSkipReason !== null,
      otpFlowSkipReason ?? "Mailpit OTP prerequisites missing."
    );
    test.skip(
      profileSkipReason !== null,
      profileSkipReason ?? "E2E profile credentials missing."
    );
  });

  test("signed-out save opens auth, persists to the authenticated profile, and stays on /films", async ({
    page,
  }) => {
    const email = uniqueOtpTestEmail("films-save");
    const profileId = await prepareE2eFilmsAuthProfile(email);

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await openAuthModalFromSaveAction(page);
    await completeFilmsAuthFromOpenModal(page, email);

    await expect(page).toHaveURL(/\/films$/);
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();

    await assertFilmSavedInProfile(profileId, filmId!, true);
    expect(await countSavedListRowsForFilm(profileId, filmId!)).toBe(1);
  });

  test("signed-out rating opens auth and persists the selected rating", async ({
    page,
  }) => {
    const email = uniqueOtpTestEmail("films-rate");
    const profileId = await prepareE2eFilmsAuthProfile(email);
    const rating = 8;

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await firstCard.getByRole("button", { name: `Rate ${rating} out of 10` }).click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await completeFilmsAuthFromOpenModal(page, email);

    await expect(page).toHaveURL(/\/films$/);
    await expect(page.getByTestId("email-auth-modal")).toHaveCount(0);
    await expect(firstCard).toContainText(`My rating: ${rating}/10`);
    await assertFilmRatingInProfile(profileId, filmId!, rating);
    expect(await countRatingRowsForFilm(profileId, filmId!)).toBe(1);
  });

  test("closing the auth modal does not write pending save or rating actions", async ({
    page,
  }) => {
    const email = uniqueOtpTestEmail("films-cancel");
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
    await expect(firstCard).toContainText("My rating: not rated yet");
    await assertFilmRatingInProfile(profileId, filmId!, null);
  });

  test("reloading after post-auth completion does not duplicate saved-list or rating writes", async ({
    page,
  }) => {
    const email = uniqueOtpTestEmail("films-idempotent");
    const profileId = await prepareE2eFilmsAuthProfile(email);
    const rating = 9;

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    await openAuthModalFromSaveAction(page);
    await completeFilmsAuthFromOpenModal(page, email);
    await expect(
      firstCard.getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();
    expect(await countSavedListRowsForFilm(profileId, filmId!)).toBe(1);

    await firstCard.getByRole("button", { name: `Rate ${rating} out of 10` }).click();
    await expect(firstCard).toContainText(`My rating: ${rating}/10`);

    await page.reload();
    await expect(firstCard).toContainText(`My rating: ${rating}/10`);
    await assertFilmRatingInProfile(profileId, filmId!, rating);
    expect(await countRatingRowsForFilm(profileId, filmId!)).toBe(1);
  });
});
