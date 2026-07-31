import { test, expect } from "@playwright/test";
import {
  countProfilesForUserId,
  E2E_SEED_FILM_ID,
  getE2eProfileSnapshot,
  linkAuthUserEmailToE2eProfile,
  seedE2eProfileRating,
  unlinkE2eProfileUser,
} from "../helpers/e2e-auth-profile";
import {
  completeFilmsMagicLinkSignIn,
  getMagicLinkFlowSkipReason,
  requestFilmsMagicLink,
  uniqueMagicLinkTestEmail,
} from "../helpers/magic-link-auth";
import {
  getProfileTestCredentials,
  profilePagePath,
  requireProfileTestCredentials,
  type ProfileTestCredentials,
} from "../helpers/profile-credentials";
import { gotoProfilePage, openProfileTab } from "../helpers/profile-page";
import { resetE2eProfile } from "../helpers/reset-e2e-profile";

test.describe("Profile auth compatibility", () => {
  test.describe.configure({ mode: "serial" });

  let credentials: ProfileTestCredentials;
  let resetFailed = false;
  let resetFailureMessage = "";
  let magicLinkFlowSkipReason: string | null = null;

  test.beforeAll(async () => {
    credentials = requireProfileTestCredentials();
    magicLinkFlowSkipReason = await getMagicLinkFlowSkipReason();

    try {
      await resetE2eProfile(credentials);
      await unlinkE2eProfileUser();
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

    await unlinkE2eProfileUser();
    await resetE2eProfile(credentials);
  });

  test.beforeEach(async () => {
    test.skip(
      resetFailed,
      resetFailureMessage || "E2E profile reset failed in beforeAll."
    );
  });

  test("retired share links redirect guests to login", async ({ page }) => {
    await page.goto(profilePagePath(credentials));

    await expect(page).toHaveURL(/\/login\?error=profile_link_retired/);
    await expect(page.getByTestId("film-list")).toHaveCount(0);
  });

  test("rejects missing or invalid share tokens with the retired-link redirect", async ({
    page,
  }) => {
    await page.goto(`/p/${credentials.slug}`);
    await expect(page).toHaveURL(/\/login\?error=profile_link_retired/);

    await page.goto(`/p/${credentials.slug}?token=wrong-token`);
    await expect(page).toHaveURL(/\/login\?error=profile_link_retired/);
    await expect(page.getByTestId("film-list")).toHaveCount(0);
  });

  test("does not link user_id when a guest opens the catalog", async ({
    page,
  }) => {
    await unlinkE2eProfileUser();
    await resetE2eProfile(credentials);

    const before = await getE2eProfileSnapshot();
    expect(before.user_id).toBeNull();

    await gotoProfilePage(page, credentials);

    const after = await getE2eProfileSnapshot();
    expect(after.user_id).toBeNull();
    expect(after.slug).toBe(before.slug);
    expect(after.share_token).toBe(before.share_token);
    expect(after.name).toBe(before.name);
  });

  test("existing linked user login preserves profile data and returns to next", async ({
    page,
  }) => {
    test.skip(
      magicLinkFlowSkipReason !== null,
      magicLinkFlowSkipReason ?? "Mailpit magic-link prerequisites missing."
    );

    const email = uniqueMagicLinkTestEmail("linked-preserve");
    await resetE2eProfile(credentials);
    await unlinkE2eProfileUser();

    const profileId = (await getE2eProfileSnapshot()).id;
    await seedE2eProfileRating(profileId, E2E_SEED_FILM_ID, 8);

    const { userId } = await linkAuthUserEmailToE2eProfile(email);
    const before = await getE2eProfileSnapshot();

    const sentAfter = await requestFilmsMagicLink(page, email);
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: (url) => url.pathname === "/",
    });

    await expect(page).toHaveURL(/\/(?:\?[^/]*)?$/);
    expect(await countProfilesForUserId(userId)).toBe(1);

    const after = await getE2eProfileSnapshot();
    expect(after.id).toBe(before.id);
    expect(after.slug).toBe(before.slug);
    expect(after.share_token).toBe(before.share_token);
    expect(after.name).toBe(before.name);
    expect(after.user_id).toBe(userId);
  });

  test("linked user opening /my-profile lands on the catalog", async ({ page }) => {
    test.skip(
      magicLinkFlowSkipReason !== null,
      magicLinkFlowSkipReason ?? "Mailpit magic-link prerequisites missing."
    );

    const email = uniqueMagicLinkTestEmail("linked-my-profile");
    await resetE2eProfile(credentials);
    await unlinkE2eProfileUser();
    await linkAuthUserEmailToE2eProfile(email);

    const sentAfter = await requestFilmsMagicLink(page, email);
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: (url) => url.pathname === "/",
    });

    await page.goto("/my-profile");
    await expect(page).toHaveURL(/\/(?:\?[^/]*)?$/);
    await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
  });

  test("preserves seeded ratings after auth callback for a linked user", async ({
    page,
  }) => {
    test.skip(
      magicLinkFlowSkipReason !== null,
      magicLinkFlowSkipReason ?? "Mailpit magic-link prerequisites missing."
    );

    const email = uniqueMagicLinkTestEmail("linked-rating-preserve");
    await resetE2eProfile(credentials);
    await unlinkE2eProfileUser();

    const profileId = (await getE2eProfileSnapshot()).id;
    await seedE2eProfileRating(profileId, E2E_SEED_FILM_ID, 7);
    await linkAuthUserEmailToE2eProfile(email);

    const sentAfter = await requestFilmsMagicLink(page, email);
    await completeFilmsMagicLinkSignIn(page, email, sentAfter, {
      waitForUrl: (url) => url.pathname === "/",
    });

    await gotoProfilePage(page, credentials);
    await openProfileTab(page, "Watched");
    await expect(
      page.locator(`[data-testid="film-card"][data-film-id="${E2E_SEED_FILM_ID}"]`)
    ).toContainText("My rating: 7/10");
  });
});

test.describe("Profile auth compatibility env guard", () => {
  test("requires dedicated E2E profile credentials", () => {
    expect(getProfileTestCredentials()).not.toBeNull();
  });
});
