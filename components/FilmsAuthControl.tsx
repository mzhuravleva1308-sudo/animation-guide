"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
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
        className="inline-flex h-[33px] shrink-0 items-center gap-[4.5px] bg-transparent text-[15px] font-normal tracking-tight text-[#5c5d6e] transition hover:text-[#1A1B2E]"
        data-testid="auth-status"
      >
        <UserRound size={16} strokeWidth={1.25} className="shrink-0" aria-hidden="true" />
        Log in
      </button>

      <EmailAuthModal open={modalOpen} onClose={() => setModalOpen(false)} postAuthPath="/films" />
    </>
  );
}
