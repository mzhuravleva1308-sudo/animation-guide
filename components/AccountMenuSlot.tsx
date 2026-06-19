import Link from "next/link";
import { getAuthUserSummary } from "@/lib/auth/session";
import AccountMenu from "@/components/AccountMenu";

export default async function AccountMenuSlot() {
  const auth = await getAuthUserSummary();

  if (!auth) {
    return (
      <Link
        href="/login"
        className="shrink-0 text-sm text-gray-500 transition hover:text-gray-900"
        data-testid="auth-status"
      >
        Log in
      </Link>
    );
  }

  return (
    <AccountMenu email={auth.email} profileName={auth.profile?.name ?? null} />
  );
}
