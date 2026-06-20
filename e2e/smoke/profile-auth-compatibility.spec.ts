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

  test("opens an existing shared profile without signing in", async ({ page }) => {
    await page.goto(profilePagePath(credentials));

    await expect(
      page.getByRole("heading", { name: "Animation Guide", level: 1 })
    ).toBeVisible();
    await expect(page.getByTestId("auth-status")).toHaveText("Log in");
    await expect(page.getByTestId("account-menu-trigger")).toHaveCount(0);
    await expect(page.getByTestId("film-list")).toBeVisible();
  });

  test("rejects missing or invalid share tokens", async ({ page }) => {
    await page.goto(`/p/${credentials.slug}`);
    await expect(
      page.getByRole("heading", { name: "Profile not found" })
    ).toBeVisible();

    await page.goto(`/p/${credentials.slug}?token=wrong-token`);
    await expect(
      page.getByRole("heading", { name: "Profile not found" })
    ).toBeVisible();
    await expect(page.getByTestId("film-list")).toHaveCount(0);
  });

  test("does not link user_id when viewing a public share link", async ({
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
      waitForUrl: /\/films(?:\?|$)/,
    });

    await expect(page).toHaveURL(/\/films(?:\?|$)/);
    expect(await countProfilesForUserId(userId)).toBe(1);

    const after = await getE2eProfileSnapshot();
    expect(after.id).toBe(before.id);
    expect(after.slug).toBe(before.slug);
    expect(after.share_token).toBe(before.share_token);
    expect(after.name).toBe(before.name);
    expect(after.user_id).toBe(userId);
  });

  test("linked user opens the personal zone via my-profile", async ({ page }) => {
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
      waitForUrl: /\/films(?:\?|$)/,
    });

    await page.goto("/my-profile");
    await expect(page).toHaveURL(
      new RegExp(`/p/${credentials.slug}\\?token=${encodeURIComponent(credentials.token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
    await expect(
      page.getByRole("heading", { name: "Animation Guide", level: 1 })
    ).toBeVisible();
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
      waitForUrl: /\/films(?:\?|$)/,
    });

    await page.goto(profilePagePath(credentials));
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
