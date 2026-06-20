"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  canResendMagicLink,
  formatExistingLinkBody,
  formatLinkSentBody,
  formatMagicLinkError,
  formatResendCooldownMessage,
  getMagicLinkResendDelayMs,
  isValidAuthEmail,
  normalizeAuthEmail,
  resolveMagicLinkSendOutcome,
} from "@/lib/auth/magic-link-auth";
import { requestMagicLink } from "@/lib/auth/magic-link-auth-client";
import { POST_AUTH_PATH } from "@/lib/auth/post-auth-path";

type EmailMagicLinkAuthFormProps = {
  postAuthPath?: string;
  testIdPrefix?: "login" | "email-auth";
  autoFocus?: boolean;
};

type AuthStep = "email" | "sent";
type LoadingAction = "send" | "resend" | null;
type LinkDeliveryHint = "sent" | "existing";

export default function EmailMagicLinkAuthForm({
  postAuthPath = POST_AUTH_PATH,
  testIdPrefix = "email-auth",
  autoFocus = true,
}: EmailMagicLinkAuthFormProps) {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const emailFormId = useId();

  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [resendDelayMs, setResendDelayMs] = useState(0);
  const [linkDeliveryHint, setLinkDeliveryHint] =
    useState<LinkDeliveryHint>("sent");

  const emailInputTestId =
    testIdPrefix === "login" ? "login-email" : "email-auth-email";
  const continueButtonTestId =
    testIdPrefix === "login" ? "login-send-link" : "email-auth-continue";
  const sentHeadingTestId =
    testIdPrefix === "login" ? "login-sent-heading" : "email-auth-sent-heading";
  const sentMessageTestId =
    testIdPrefix === "login"
      ? linkDeliveryHint === "sent"
        ? "login-link-sent-message"
        : "login-link-existing-message"
      : linkDeliveryHint === "sent"
        ? "email-auth-link-sent-message"
        : "email-auth-link-existing-message";

  useEffect(() => {
    if (!autoFocus || step !== "email") {
      return;
    }

    emailInputRef.current?.focus({ preventScroll: true });
  }, [autoFocus, step]);

  useEffect(() => {
    if (step !== "sent") {
      return;
    }

    const updateDelay = () => {
      setResendDelayMs(getMagicLinkResendDelayMs(lastSentAt));
    };

    updateDelay();
    const intervalId = window.setInterval(updateDelay, 500);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [lastSentAt, step]);

  function openSentStep({
    normalizedEmail,
    deliveryHint,
    statusMessage,
  }: {
    normalizedEmail: string;
    deliveryHint: LinkDeliveryHint;
    statusMessage: string | null;
  }) {
    setEmail(normalizedEmail);
    setStep("sent");
    setLinkDeliveryHint(deliveryHint);
    setLastSentAt(Date.now());
    setMessage(statusMessage);
  }

  async function sendLink(targetEmail: string, action: "send" | "resend") {
    const normalizedEmail = normalizeAuthEmail(targetEmail);

    if (!isValidAuthEmail(normalizedEmail)) {
      setMessage("Enter a valid email address.");
      return;
    }

    if (
      action === "resend" &&
      step === "sent" &&
      !canResendMagicLink(lastSentAt)
    ) {
      setMessage(formatResendCooldownMessage());
      return;
    }

    setLoading(action);
    setMessage(null);

    const { error } = await requestMagicLink(normalizedEmail, postAuthPath);
    const outcome = resolveMagicLinkSendOutcome(error);

    if (outcome === "success") {
      openSentStep({
        normalizedEmail,
        deliveryHint: "sent",
        statusMessage: null,
      });
      setLoading(null);
      return;
    }

    if (outcome === "rate_limited") {
      const enteringFromEmail = step === "email" && action === "send";
      openSentStep({
        normalizedEmail,
        deliveryHint: "existing",
        statusMessage: enteringFromEmail ? null : formatResendCooldownMessage(),
      });
      setLoading(null);
      return;
    }

    setMessage(formatMagicLinkError(error));
    setLoading(null);
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendLink(email, "send");
  }

  function handleChangeEmail() {
    setStep("email");
    setMessage(null);
    setLoading(null);
    setLinkDeliveryHint("sent");
  }

  const isBusy = loading !== null;
  const resendAvailable = canResendMagicLink(lastSentAt);
  const resendSeconds = Math.ceil(resendDelayMs / 1000);

  if (step === "email") {
    return (
      <>
        <form
          id={emailFormId}
          className="mt-4 space-y-3"
          onSubmit={handleEmailSubmit}
          autoComplete="off"
        >
          <div>
            <label htmlFor={emailInputTestId} className="sr-only">
              Email address
            </label>
            <input
              ref={emailInputRef}
              id={emailInputTestId}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setMessage(null);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Email address"
              data-testid={emailInputTestId}
            />
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            data-testid={continueButtonTestId}
          >
            {loading === "send" ? "Sending link..." : "Send sign-in link"}
          </button>
        </form>

        {message ? (
          <p
            className="mt-3 text-sm text-gray-600"
            role="status"
            data-testid={
              testIdPrefix === "login" ? "login-message" : "email-auth-message"
            }
          >
            {message}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <h3
        className="mt-4 text-sm font-medium text-gray-900"
        data-testid={sentHeadingTestId}
      >
        Check your inbox
      </h3>

      <p className="mt-2 text-sm text-gray-600" data-testid={sentMessageTestId}>
        {linkDeliveryHint === "sent"
          ? formatLinkSentBody(email)
          : formatExistingLinkBody(email)}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          disabled={isBusy}
          onClick={handleChangeEmail}
          className="text-gray-600 hover:text-gray-900 disabled:opacity-60"
          data-testid={
            testIdPrefix === "login"
              ? "login-change-email"
              : "email-auth-change-email"
          }
        >
          Change email
        </button>

        <button
          type="button"
          disabled={isBusy || !resendAvailable}
          onClick={() => void sendLink(email, "resend")}
          className="text-gray-600 hover:text-gray-900 disabled:opacity-60"
          data-testid={
            testIdPrefix === "login" ? "login-resend-link" : "email-auth-resend"
          }
        >
          {loading === "resend"
            ? "Sending link..."
            : resendAvailable
              ? "Resend link"
              : `Resend in ${resendSeconds}s`}
        </button>
      </div>

      {message ? (
        <p
          className="mt-3 text-sm text-gray-600"
          role="status"
          data-testid={
            testIdPrefix === "login" ? "login-message" : "email-auth-message"
          }
        >
          {message}
        </p>
      ) : null}
    </>
  );
}
