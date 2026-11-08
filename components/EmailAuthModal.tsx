"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import EmailAuthModalHero from "@/components/EmailAuthModalHero";
import EmailMagicLinkAuthForm from "@/components/EmailMagicLinkAuthForm";
import {
  getAuthModalCopy,
  type AuthModalReason,
  type AuthModalStep,
} from "@/lib/auth/auth-modal-copy";
import { PRIVACY_PATH } from "@/lib/legal/privacy";
import { lockBodyScroll } from "@/lib/modal-body-scroll-lock";

type EmailAuthModalProps = {
  open: boolean;
  onClose: () => void;
  postAuthPath?: string;
  reason?: AuthModalReason;
  filmTitle?: string | null;
  rating?: number | null;
  lockScrollY?: number;
  restoreFocusElement?: HTMLElement | null;
};

export default function EmailAuthModal({
  open,
  onClose,
  postAuthPath = "/",
  reason = "login",
  filmTitle = null,
  rating = null,
  lockScrollY,
  restoreFocusElement = null,
}: EmailAuthModalProps) {
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const [step, setStep] = useState<AuthModalStep>("email");

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setStep("email");
    lastActiveElementRef.current =
      restoreFocusElement ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);

    return lockBodyScroll(lockScrollY ?? window.scrollY);
  }, [lockScrollY, open, restoreFocusElement]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }

    if (!wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = false;

    const element = lastActiveElementRef.current;
    if (element && document.contains(element)) {
      element.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, open]);

  if (!open) {
    return null;
  }

  const copy = getAuthModalCopy(reason, step, { filmTitle });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="email-auth-modal"
      data-auth-reason={reason}
    >
      <button
        type="button"
        aria-label="Close sign-in dialog"
        className="absolute inset-0 bg-[#1A1B2E]/30"
        onClick={handleClose}
        data-testid="email-auth-modal-overlay"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={
          copy.description ? dialogDescriptionId : undefined
        }
        className="relative z-10 max-h-[min(100dvh-2rem,40rem)] w-full max-w-[380px] overflow-y-auto rounded-2xl border border-[#e4e2f0] bg-white p-6 shadow-[0_18px_50px_rgba(26,27,46,0.16)]"
        data-testid="email-auth-modal-panel"
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#7a7b90] transition hover:bg-[#f7f6fb] hover:text-[#1A1B2E]"
          aria-label="Close"
          data-testid="email-auth-modal-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {step === "email" ? (
          <div className="pr-6">
            <EmailAuthModalHero
              reason={reason}
              filmTitle={filmTitle}
              rating={rating}
            />
            <h2
              id={dialogTitleId}
              className="mt-4 font-sans text-[20px] font-semibold leading-snug tracking-tight text-[#1A1B2E]"
              data-testid="email-auth-modal-title"
            >
              {copy.title}
            </h2>
            {copy.description ? (
              <p
                id={dialogDescriptionId}
                className="mt-2 text-[14px] leading-6 text-[#5c5d6e]"
                data-testid="email-auth-modal-description"
              >
                {copy.description}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="pr-6">
            <h2
              id={dialogTitleId}
              className="font-sans text-[20px] font-semibold leading-snug tracking-tight text-[#1A1B2E]"
              data-testid="email-auth-sent-heading"
            >
              {copy.title}
            </h2>
          </div>
        )}

        <EmailMagicLinkAuthForm
          postAuthPath={postAuthPath}
          testIdPrefix="email-auth"
          headingMode="embedded"
          appearance="modal"
          onStepChange={setStep}
        />

        <p className="mt-5 text-center text-xs text-[#7a7b90]">
          <Link
            href={PRIVACY_PATH}
            className="underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E]"
            data-testid="email-auth-privacy-link"
          >
            Privacy policy
          </Link>
        </p>
      </div>
    </div>
  );
}
