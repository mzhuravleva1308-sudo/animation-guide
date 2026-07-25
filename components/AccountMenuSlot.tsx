import { UserRound } from "lucide-react";
import { getAuthUserSummary } from "@/lib/auth/session";
import AccountMenu from "@/components/AccountMenu";
import {
  HeaderIconLink,
  HEADER_LOGIN_ICON,
} from "@/components/HeaderIconControl";

export default async function AccountMenuSlot() {
  const auth = await getAuthUserSummary();

  if (!auth) {
    return (
      <HeaderIconLink
        label="Log in"
        href="/login"
        showLabel={false}
        data-testid="auth-status"
      >
        <UserRound
          size={HEADER_LOGIN_ICON.size}
          strokeWidth={HEADER_LOGIN_ICON.strokeWidth}
          fill="none"
          className="!h-[11px] !w-[11px] shrink-0"
          aria-hidden="true"
        />
      </HeaderIconLink>
    );
  }

  return (
    <AccountMenu email={auth.email} profileName={auth.profile?.name ?? null} />
  );
}
