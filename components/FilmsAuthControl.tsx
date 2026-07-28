"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import EmailAuthModal from "@/components/EmailAuthModal";
import {
  HeaderIconButton,
  HEADER_LOGIN_ICON,
} from "@/components/HeaderIconControl";
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
      <HeaderIconButton
        label="Log in"
        showLabel={false}
        onClick={() => setModalOpen(true)}
        data-testid="auth-status"
      >
        <UserRound
          size={HEADER_LOGIN_ICON.size}
          strokeWidth={HEADER_LOGIN_ICON.strokeWidth}
          fill="none"
          className="shrink-0"
          aria-hidden="true"
        />
      </HeaderIconButton>

      <EmailAuthModal open={modalOpen} onClose={() => setModalOpen(false)} postAuthPath="/films" />
    </>
  );
}
