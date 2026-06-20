"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  canResendEmailOtp,
  formatCodeSentMessage,
  formatEmailOtpError,
  formatExistingCodeMessage,
  formatResendCooldownMessage,
  getEmailOtpResendDelayMs,
  isCompleteOtpCode,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
  resolveEmailOtpSendOutcome,
} from "@/lib/auth/email-otp";
import {
  requestEmailOtp,
  verifyEmailOtp,
} from "@/lib/auth/email-otp-client";
import { POST_AUTH_PATH } from "@/lib/auth/post-auth-path";

type EmailOtpAuthFormProps = {
  postAuthPath?: string;
  testIdPrefix?: "login" | "email-auth";
  autoFocus?: boolean;
  onVerifySuccess?: () => void | Promise<void>;
};

type AuthStep = "email" | "code";
type LoadingAction = "send" | "verify" | "resend" | null;
type CodeDeliveryHint = "sent" | "existing";

export default function EmailOtpAuthForm({
  postAuthPath = POST_AUTH_PATH,
  testIdPrefix = "email-auth",
  autoFocus = true,
  onVerifySuccess,
}: EmailOtpAuthFormProps) {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const otpInputId = useId();
  const emailFormId = useId();
  const otpFormId = useId();

  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [resendDelayMs, setResendDelayMs] = useState(0);
  const [codeDeliveryHint, setCodeDeliveryHint] =
    useState<CodeDeliveryHint>("sent");

  const emailInputTestId =
    testIdPrefix === "login" ? "login-email" : "email-auth-email";
  const otpInputTestId =
    testIdPrefix === "login" ? "login-otp" : "email-auth-otp";

  useEffect(() => {
    if (!autoFocus || step !== "email") {
      return;
    }

    emailInputRef.current?.focus();
  }, [autoFocus, step]);

  useEffect(() => {
    if (!autoFocus || step !== "code") {
      return;
    }

    const input = codeInputRef.current;
    if (!input) {
      return;
    }

    // Brief readonly focus prevents Safari from treating this as a password field.
    input.readOnly = true;
    input.focus({ preventScroll: true });

    const frameId = window.requestAnimationFrame(() => {
      input.readOnly = false;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [autoFocus, step]);

  useEffect(() => {
    if (step !== "code") {
      return;
    }

    const updateDelay = () => {
      setResendDelayMs(getEmailOtpResendDelayMs(lastSentAt));
    };

    updateDelay();
    const intervalId = window.setInterval(updateDelay, 500);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [lastSentAt, step]);

  function openCodeStep({
    normalizedEmail,
    deliveryHint,
    statusMessage,
    preserveCode,
  }: {
    normalizedEmail: string;
    deliveryHint: CodeDeliveryHint;
    statusMessage: string | null;
    preserveCode: boolean;
  }) {
    setEmail(normalizedEmail);
    if (!preserveCode) {
      setCode("");
    }
    setStep("code");
    setCodeDeliveryHint(deliveryHint);
    setLastSentAt(Date.now());
    setMessage(statusMessage);
  }

  async function sendCode(targetEmail: string, action: "send" | "resend") {
    const normalizedEmail = normalizeAuthEmail(targetEmail);

    if (!isValidAuthEmail(normalizedEmail)) {
      setMessage("Enter a valid email address.");
      return;
    }

    if (
      action === "resend" &&
      step === "code" &&
      !canResendEmailOtp(lastSentAt)
    ) {
      setMessage(formatResendCooldownMessage());
      return;
    }

    setLoading(action);
    setMessage(null);

    const { error } = await requestEmailOtp(normalizedEmail);
    const outcome = resolveEmailOtpSendOutcome(error);

    if (outcome === "success") {
      openCodeStep({
        normalizedEmail,
        deliveryHint: "sent",
        statusMessage: null,
        preserveCode: action === "resend",
      });
      setLoading(null);
      return;
    }

    if (outcome === "rate_limited") {
      const enteringFromEmail = step === "email" && action === "send";
      openCodeStep({
        normalizedEmail,
        deliveryHint: "existing",
        statusMessage: enteringFromEmail ? null : formatResendCooldownMessage(),
        preserveCode: action === "resend",
      });
      setLoading(null);
      return;
    }

    setMessage(formatEmailOtpError(error));
    setLoading(null);
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCode(email, "send");
  }

  async function handleCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedCode = normalizeOtpCode(code);

    if (!isCompleteOtpCode(normalizedCode)) {
      setMessage("Enter the 6-digit code.");
      return;
    }

    setLoading("verify");
    setMessage(null);

    const { error } = await verifyEmailOtp(email, normalizedCode);

    if (error) {
      setMessage(formatEmailOtpError(error));
      setLoading(null);
      return;
    }

    if (onVerifySuccess) {
      await onVerifySuccess();
      setLoading(null);
      return;
    }

    window.location.assign(postAuthPath);
  }

  function handleCodeChange(event: React.ChangeEvent<HTMLInputElement>) {
    setCode(normalizeOtpCode(event.target.value));
    setMessage(null);
  }

  function handleCodePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    setCode(normalizeOtpCode(event.clipboardData.getData("text")));
    setMessage(null);
  }

  function handleChangeEmail() {
    setStep("email");
    setCode("");
    setMessage(null);
    setLoading(null);
    setCodeDeliveryHint("sent");
  }

  const isBusy = loading !== null;
  const resendAvailable = canResendEmailOtp(lastSentAt);
  const resendSeconds = Math.ceil(resendDelayMs / 1000);

  const codeStepMessageTestId =
    testIdPrefix === "login"
      ? codeDeliveryHint === "sent"
        ? "login-code-sent-message"
        : "login-code-existing-message"
      : codeDeliveryHint === "sent"
        ? "email-auth-code-sent-message"
        : "email-auth-code-existing-message";

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
            data-testid={
              testIdPrefix === "login"
                ? "login-send-code"
                : "email-auth-continue"
            }
          >
            {loading === "send" ? "Sending code..." : "Send sign-in code"}
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
      <p
        className="mt-4 text-sm text-gray-600"
        data-testid={codeStepMessageTestId}
      >
        {codeDeliveryHint === "sent"
          ? formatCodeSentMessage(email)
          : formatExistingCodeMessage(email)}
      </p>

      <form
        id={otpFormId}
        className="mt-4 space-y-3"
        onSubmit={handleCodeSubmit}
        autoComplete="off"
        aria-label="Verification code entry"
      >
        <fieldset className="space-y-3 border-0 p-0">
          <legend className="sr-only">Verification code</legend>
          <div>
            <label htmlFor={otpInputId} className="sr-only">
              Verification code
            </label>
            <input
              ref={codeInputRef}
              id={otpInputId}
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              maxLength={6}
              required
              value={code}
              onChange={handleCodeChange}
              onPaste={handleCodePaste}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.35em] text-gray-900"
              aria-label="Verification code"
              data-testid={otpInputTestId}
            />
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={isBusy}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          data-testid={
            testIdPrefix === "login" ? "login-verify-code" : "email-auth-verify"
          }
        >
          {loading === "verify" ? "Verifying..." : "Continue"}
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
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
            onClick={() => void sendCode(email, "resend")}
            className="text-gray-600 hover:text-gray-900 disabled:opacity-60"
            data-testid={
              testIdPrefix === "login" ? "login-resend-code" : "email-auth-resend"
            }
          >
            {loading === "resend"
              ? "Sending code..."
              : resendAvailable
                ? "Resend code"
                : `Resend in ${resendSeconds}s`}
          </button>
        </div>
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
