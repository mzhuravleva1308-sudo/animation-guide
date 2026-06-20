"use client";

import { useState } from "react";
import AccountMenu from "@/components/AccountMenu";
import EmailAuthModal from "@/components/EmailAuthModal";
import type { AuthUserSummary } from "@/lib/auth/session";

type FilmsAuthControlProps = {
  auth: AuthUserSummary | null;
};

export default function FilmsAuthControl({ auth }: FilmsAuthControlProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (auth) {
    return (
      <AccountMenu email={auth.email} profileName={auth.profile?.name ?? null} />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="shrink-0 text-sm text-gray-500 transition hover:text-gray-900"
        data-testid="auth-status"
      >
        Log in
      </button>

      <EmailAuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
