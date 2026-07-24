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
        className="inline-flex h-9 shrink-0 items-center gap-1.5 bg-transparent text-sm font-normal text-slate-700 transition hover:text-slate-900"
        data-testid="auth-status"
      >
        <UserRound size={18} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        Log in
      </Link>
    );
  }

  return (
    <AccountMenu email={auth.email} profileName={auth.profile?.name ?? null} />
  );
}
