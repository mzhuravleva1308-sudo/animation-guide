import type { Page } from "@playwright/test";
import {
  getLocalMagicLinkAuthSkipReason,
} from "./local-supabase";
import {
  getMailpitMagicLinkSkipReason,
  waitForMailpitAuthLink,
} from "./mailpit";

export function uniqueSignupTestEmail(prefix = "signup-confirm"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function getSignupConfirmationSkipReason(): Promise<string | null> {
  return (
    getLocalMagicLinkAuthSkipReason() ?? (await getMailpitMagicLinkSkipReason())
  );
}

export async function requestLoginMagicLink(
  page: Page,
  email: string
): Promise<Date> {
  const sentAfter = new Date();

  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-send-link").click();
  await page.getByTestId("login-sent-heading").waitFor({ timeout: 10_000 });

  return sentAfter;
}

export async function completeLoginMagicLinkSignIn(
  page: Page,
  email: string,
  sentAfter: Date
): Promise<string> {
  const confirmationUrl = await waitForMailpitAuthLink({ email, sentAfter });

  await page.goto(confirmationUrl);
  await page.waitForURL((url) => {
    const pathname = new URL(url).pathname;
    return pathname === "/" || pathname.startsWith("/p/");
  }, {
    timeout: 20_000,
  });

  return confirmationUrl;
}
