import Link from "next/link";
import { UserRound } from "lucide-react";
import { getAuthUserSummary } from "@/lib/auth/session";
import AccountMenu from "@/components/AccountMenu";

export default async function AccountMenuSlot() {
  const auth = await getAuthUserSummary();

  if (!auth) {
    return (
      <Link
        href="/login"
        className="inline-flex h-[33px] shrink-0 items-center gap-[4.5px] bg-transparent text-[15px] font-normal tracking-tight text-[#5c5d6e] transition hover:text-[#1A1B2E]"
        data-testid="auth-status"
      >
        <UserRound size={16} strokeWidth={1.25} className="shrink-0" aria-hidden="true" />
        Log in
      </Link>
    );
  }

  return (
    <AccountMenu email={auth.email} profileName={auth.profile?.name ?? null} />
  );
}
