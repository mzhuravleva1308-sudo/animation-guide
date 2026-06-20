import type { Page } from "@playwright/test";
import { getLocalMagicLinkAuthSkipReason } from "./local-supabase";
import {
  getMailpitMagicLinkSkipReason,
  waitForMailpitMagicLink,
} from "./mailpit";

export function uniqueMagicLinkTestEmail(prefix = "magic-link-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function getMagicLinkFlowSkipReason(): Promise<string | null> {
  return (
    getLocalMagicLinkAuthSkipReason() ?? (await getMailpitMagicLinkSkipReason())
  );
}

export async function requestFilmsMagicLink(
  page: Page,
  email: string
): Promise<Date> {
  const sentAfter = new Date();

  await page.goto("/films");
  await page.getByTestId("auth-status").click();
  await page.getByTestId("email-auth-email").fill(email);
  await page.getByTestId("email-auth-continue").click();
  await page.getByTestId("email-auth-sent-heading").waitFor({ timeout: 10_000 });

  return sentAfter;
}

export async function completeFilmsMagicLinkSignIn(
  page: Page,
  email: string,
  sentAfter: Date,
  options?: { waitForUrl?: RegExp }
): Promise<string> {
  const confirmationUrl = await waitForMailpitMagicLink({ email, sentAfter });

  await page.goto(confirmationUrl);
  await page.waitForURL(
    options?.waitForUrl ?? /\/(p\/[^/?#]+|films)(?:\?|$)/,
    { timeout: 20_000 }
  );

  return confirmationUrl;
}

export function profileGuideUrlPattern(slug: string): RegExp {
  return new RegExp(`/p/${slug}(?:\\?|$)`);
}
