import { test, expect } from "@playwright/test";
import {
  assertFilmSavedInProfile,
  countProfilesForUserId,
  countSavedListRowsForFilm,
  deleteAuthUserByEmailForTests,
  findAuthUserIdByEmail,
  findProfileByUserId,
  uniquePersonalGuideTestEmail,
} from "../helpers/e2e-auth-profile";
import {
  completeFilmsMagicLinkSignIn,
  getMagicLinkFlowSkipReason,
  profileGuideUrlPattern,
} from "../helpers/magic-link-auth";
import {
  firstFilmCard,
  openProfileTab,
  waitForWatchlistButton,
} from "../helpers/profile-page";
import { profilePagePath } from "../helpers/profile-credentials";

test.describe("Films auth profile provisioning with Mailpit", () => {
  let magicLinkFlowSkipReason: string | null = null;

  test.beforeAll(async () => {
    magicLinkFlowSkipReason = await getMagicLinkFlowSkipReason();
  });

  test.beforeEach(async () => {
    test.skip(
      magicLinkFlowSkipReason !== null,
      magicLinkFlowSkipReason ?? "Mailpit magic-link prerequisites missing."
    );
  });

  test("creates a linked personal guide after signup and applies a pending save", async ({
    page,
  }) => {
    const email = uniquePersonalGuideTestEmail("signup-save");
    await deleteAuthUserByEmailForTests(email);

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    const filmId = await firstCard.getAttribute("data-film-id");
    expect(filmId).toBeTruthy();

    const saveButton = await waitForWatchlistButton(firstCard, "Add to watchlist");
    await saveButton.click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.getByTestId("email-auth-email").fill(email);
    const sentAfter = new Date();
    await page.getByTestId("email-auth-continue").click();
    await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });

    await completeFilmsMagicLinkSignIn(page, email, sentAfter);

    const userId = await findAuthUserIdByEmail(email);
    expect(userId).toBeTruthy();

    await expect.poll(async () => countProfilesForUserId(userId!)).toBe(1);

    const profile = await findProfileByUserId(userId!);
    expect(profile?.id).toBeTruthy();
    expect(profile?.slug).toBeTruthy();
    expect(profile?.share_token).toBeTruthy();
    expect(profile?.user_id).toBe(userId);

    await expect(page).toHaveURL(profileGuideUrlPattern(profile!.slug!));
    expect(new URL(page.url()).searchParams.get("token")).toBe(profile!.share_token);
    expect(page.url()).toContain(
      profilePagePath({
        slug: profile!.slug!,
        token: profile!.share_token!,
      })
    );
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();

    await openProfileTab(page, "Saved");
    await expect(
      firstFilmCard(page).getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();

    await expect
      .poll(async () => countSavedListRowsForFilm(profile!.id, filmId!))
      .toBe(1);
    await assertFilmSavedInProfile(profile!.id, filmId!, true);

    await page.reload();
    await expect(page).toHaveURL(profileGuideUrlPattern(profile!.slug!));
    await openProfileTab(page, "Saved");
    await expect(
      firstFilmCard(page).getByRole("button", { name: "Remove from watchlist" })
    ).toBeVisible();
    expect(await countProfilesForUserId(userId!)).toBe(1);
    expect(await countSavedListRowsForFilm(profile!.id, filmId!)).toBe(1);
  });

  test("does not create a second profile when callback fails on repeat", async ({
    page,
  }) => {
    const email = uniquePersonalGuideTestEmail("repeat-callback");
    await deleteAuthUserByEmailForTests(email);

    await page.goto("/films");
    const firstCard = firstFilmCard(page);
    await (await waitForWatchlistButton(firstCard, "Add to watchlist")).click();
    await expect(page.getByTestId("email-auth-modal")).toBeVisible();

    await page.getByTestId("email-auth-email").fill(email);
    const sentAfter = new Date();
    await page.getByTestId("email-auth-continue").click();
    await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });
    await completeFilmsMagicLinkSignIn(page, email, sentAfter);

    const userId = await findAuthUserIdByEmail(email);
    expect(userId).toBeTruthy();
    expect(await countProfilesForUserId(userId!)).toBe(1);

    await page.goto(
      "/auth/callback?token_hash=invalid-token-hash&type=email&next=%2Ffilms"
    );
    await expect(page).toHaveURL(/\/login\?/);
    expect(await countProfilesForUserId(userId!)).toBe(1);
  });
});
