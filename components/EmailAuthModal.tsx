"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import EmailMagicLinkAuthForm from "@/components/EmailMagicLinkAuthForm";
import { lockBodyScroll } from "@/lib/modal-body-scroll-lock";

type EmailAuthModalProps = {
  open: boolean;
  onClose: () => void;
  postAuthPath?: string;
  lockScrollY?: number;
  restoreFocusElement?: HTMLElement | null;
};

export default function EmailAuthModal({
  open,
  onClose,
  postAuthPath = "/",
  lockScrollY,
  restoreFocusElement = null,
}: EmailAuthModalProps) {
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      data-testid="email-auth-modal"
    >
      <button
        type="button"
        aria-label="Close sign-in dialog"
        className="absolute inset-0 bg-black/30"
        onClick={handleClose}
        data-testid="email-auth-modal-overlay"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        className="relative z-10 w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        data-testid="email-auth-modal-panel"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id={dialogTitleId}
              className="text-base font-semibold text-gray-900"
            >
              Log in
            </h2>
            <p
              id={dialogDescriptionId}
              className="mt-1 text-sm text-gray-600"
            >
              Enter your email and we&apos;ll send you a sign-in link.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            aria-label="Close"
            data-testid="email-auth-modal-close"
          >
            Close
          </button>
        </div>

        <EmailMagicLinkAuthForm
          postAuthPath={postAuthPath}
          testIdPrefix="email-auth"
        />
      </div>
    </div>
  );
}
