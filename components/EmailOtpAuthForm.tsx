"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  canResendEmailOtp,
  formatCodeSentMessage,
  formatEmailOtpError,
  getEmailOtpResendDelayMs,
  isCompleteOtpCode,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
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
};

type AuthStep = "email" | "code";
type LoadingAction = "send" | "verify" | "resend" | null;

export default function EmailOtpAuthForm({
  postAuthPath = POST_AUTH_PATH,
  testIdPrefix = "email-auth",
  autoFocus = true,
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

  async function sendCode(targetEmail: string, action: "send" | "resend") {
    const normalizedEmail = normalizeAuthEmail(targetEmail);

    if (!isValidAuthEmail(normalizedEmail)) {
      setMessage("Enter a valid email address.");
      return;
    }

    if (action === "resend" && !canResendEmailOtp(lastSentAt)) {
      setMessage("Please wait a moment before requesting another code.");
      return;
    }

    setLoading(action);
    setMessage(null);

    const { error } = await requestEmailOtp(normalizedEmail);

    if (error) {
      setMessage(formatEmailOtpError(error));
      setLoading(null);
      return;
    }

    setEmail(normalizedEmail);
    setCode("");
    setStep("code");
    setLastSentAt(Date.now());
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
  }

  const isBusy = loading !== null;
  const resendAvailable = canResendEmailOtp(lastSentAt);
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
        data-testid={
          testIdPrefix === "login"
            ? "login-code-sent-message"
            : "email-auth-code-sent-message"
        }
      >
        {formatCodeSentMessage(email)}
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
