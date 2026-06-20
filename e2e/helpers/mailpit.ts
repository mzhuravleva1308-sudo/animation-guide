import { extractMagicLinkFromEmailContent } from "../../lib/auth/extract-magic-link-from-email.mjs";

const DEFAULT_MAILPIT_URL = "http://127.0.0.1:54324";

type MailpitMessageSummary = {
  ID: string;
  Subject?: string;
  Created?: string;
  To?: Array<{ Address?: string; Name?: string }>;
};

type MailpitSearchResponse = {
  messages?: MailpitMessageSummary[];
  Messages?: MailpitMessageSummary[];
  total?: number;
};

type MailpitMessageResponse = {
  ID: string;
  Subject?: string;
  Text?: string;
  HTML?: string;
  Created?: string;
};

export function getMailpitUrl(): string {
  const configured = process.env.MAILPIT_URL?.trim();
  return (configured || DEFAULT_MAILPIT_URL).replace(/\/$/, "");
}

export async function isMailpitReachable(
  mailpitUrl = getMailpitUrl()
): Promise<boolean> {
  try {
    const response = await fetch(`${mailpitUrl}/api/v1/info`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function getSearchMessages(payload: MailpitSearchResponse): MailpitMessageSummary[] {
  return payload.messages ?? payload.Messages ?? [];
}

function messageMatchesRecipient(
  message: MailpitMessageSummary,
  email: string
): boolean {
  const normalizedEmail = email.trim().toLowerCase();

  return (message.To ?? []).some((recipient) => {
    const address = recipient.Address?.trim().toLowerCase();
    return address === normalizedEmail;
  });
}

function isCreatedAfter(
  created: string | undefined,
  sentAfter: Date | undefined
): boolean {
  if (!sentAfter || !created) {
    return true;
  }

  const createdAt = Date.parse(created);
  return Number.isFinite(createdAt) && createdAt >= sentAfter.getTime() - 1_000;
}

async function fetchMailpitMessage(
  mailpitUrl: string,
  messageId: string
): Promise<MailpitMessageResponse> {
  const response = await fetch(`${mailpitUrl}/api/v1/message/${messageId}`);

  if (!response.ok) {
    throw new Error(`Mailpit message fetch failed with status ${response.status}.`);
  }

  return (await response.json()) as MailpitMessageResponse;
}

async function searchRecipientMessages(
  mailpitUrl: string,
  email: string
): Promise<MailpitMessageSummary[]> {
  const query = encodeURIComponent(`to:${email}`);
  const response = await fetch(
    `${mailpitUrl}/api/v1/search?query=${query}&limit=20`
  );

  if (!response.ok) {
    throw new Error(`Mailpit search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as MailpitSearchResponse;
  return getSearchMessages(payload).filter((message) =>
    messageMatchesRecipient(message, email)
  );
}

export type WaitForMailpitMagicLinkOptions = {
  email: string;
  mailpitUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  sentAfter?: Date;
};

export async function waitForMailpitMagicLink(
  options: WaitForMailpitMagicLinkOptions
): Promise<string> {
  const mailpitUrl = options.mailpitUrl ?? getMailpitUrl();
  const timeoutMs = options.timeoutMs ?? 20_000;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const summaries = await searchRecipientMessages(
        mailpitUrl,
        options.email
      );
      const candidate = summaries.find((message) =>
        isCreatedAfter(message.Created, options.sentAfter)
      );

      if (candidate?.ID) {
        const fullMessage = await fetchMailpitMessage(mailpitUrl, candidate.ID);
        const confirmationUrl = extractMagicLinkFromEmailContent(
          fullMessage.HTML ?? fullMessage.Text ?? ""
        );

        if (confirmationUrl) {
          return confirmationUrl;
        }

        lastError = new Error(
          `Mailpit message ${candidate.ID} did not contain a sign-in link.`
        );
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unknown Mailpit polling error.");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }

  throw (
    lastError ??
    new Error(
      `Timed out waiting for a sign-in link email to ${options.email} in Mailpit.`
    )
  );
}

export async function getMailpitMagicLinkSkipReason(): Promise<string | null> {
  const reachable = await isMailpitReachable();

  if (!reachable) {
    return `Requires Mailpit (${getMailpitUrl()}). Start the local stack with \`supabase start\` and confirm the Mailpit URL via \`supabase status\`.`;
  }

  return null;
}
