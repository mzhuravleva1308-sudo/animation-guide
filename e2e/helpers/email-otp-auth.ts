import type { Page } from "@playwright/test";
import { getLocalOtpAuthSkipReason } from "./local-supabase";
import { getMailpitOtpSkipReason, waitForMailpitOtpCode } from "./mailpit";

export function uniqueOtpTestEmail(prefix = "otp-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function getEmailOtpFlowSkipReason(): Promise<string | null> {
  return getLocalOtpAuthSkipReason() ?? (await getMailpitOtpSkipReason());
}

export async function requestFilmsEmailOtp(
  page: Page,
  email: string
): Promise<Date> {
  const sentAfter = new Date();

  await page.goto("/films");
  await page.getByTestId("auth-status").click();
  await page.getByTestId("email-auth-email").fill(email);
  await page.getByTestId("email-auth-continue").click();
  await page.getByTestId("email-auth-otp").waitFor({ timeout: 10_000 });

  return sentAfter;
}

export async function completeFilmsEmailOtpSignIn(
  page: Page,
  email: string,
  sentAfter: Date
): Promise<string> {
  const code = await waitForMailpitOtpCode({ email, sentAfter });

  await page.getByTestId("email-auth-otp").fill(code);
  await page.getByTestId("email-auth-verify").click();

  return code;
}
