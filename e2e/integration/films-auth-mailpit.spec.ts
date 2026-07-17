import { test, expect } from "@playwright/test";
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
} from "../helpers/profile-credentials";

test.describe("Films magic-link auth with Mailpit", () => {
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

  test("opens the auth modal and requests a sign-in link", async ({ page }) => {
    const email = uniqueMagicLinkTestEmail("films-ui");

    await requestFilmsMagicLink(page, email);

    await expect(page.getByTestId("email-auth-sent-heading")).toHaveText(
      "Check your inbox"
    );
    await expect(page.getByText(/We sent a sign-in link to/)).toBeVisible();
    await expect(page.getByTestId("email-auth-change-email")).toBeVisible();
    await expect(page.getByTestId("email-auth-resend")).toBeVisible();
    await expect(page.getByTestId("email-auth-otp")).toHaveCount(0);
  });

  test("emails a valid auth callback link via Mailpit", async ({ page }) => {
    const email = uniqueMagicLinkTestEmail("films-link-shape");
    const sentAfter = await requestFilmsMagicLink(page, email);
    const { waitForMailpitMagicLink } = await import("../helpers/mailpit");
    const confirmationUrl = await waitForMailpitMagicLink({ email, sentAfter });

    expect(confirmationUrl).not.toMatch(/^https?:\/\/[^/?#]+&/);
    expect(confirmationUrl).toMatch(/\/auth\/callback\?/);
    expect(confirmationUrl).toMatch(/token_hash=/);
    expect(confirmationUrl).toMatch(/type=(email|signup)/);
  });

  test("retrieves the magic link from Mailpit and completes sign-in", async ({
    page,
  }) => {
    const credentials = getProfileTestCredentials();
    test.skip(
      credentials === null,
      "Missing E2E_PROFILE_SLUG and E2E_PROFILE_TOKEN (see ENV.md)."
    );

    const email = uniqueMagicLinkTestEmail("films-sign-in");
    const sentAfter = await requestFilmsMagicLink(page, email);
    const confirmationUrl = await completeFilmsMagicLinkSignIn(
      page,
      email,
      sentAfter
    );

    expect(confirmationUrl).toMatch(/\/auth\/callback\?.*token_hash=.*type=(email|signup)/);
    await expect(page).toHaveURL(profileGuideUrlPattern(credentials!.slug));
    expect(page.url()).toContain(profilePagePath(credentials!));
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(page.getByTestId("auth-status")).not.toContainText("Log in");
  });
});
