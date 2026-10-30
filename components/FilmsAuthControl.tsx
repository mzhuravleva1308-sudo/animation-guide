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
      <AccountMenu onLogin={() => setModalOpen(true)} />
      <EmailAuthModal open={modalOpen} onClose={() => setModalOpen(false)} postAuthPath="/" />
    </>
  );
}
