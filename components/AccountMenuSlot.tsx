import { getAuthUserSummary } from "@/lib/auth/session";
import AccountMenu from "@/components/AccountMenu";

export default async function AccountMenuSlot() {
  const auth = await getAuthUserSummary();

  if (!auth) {
    return <AccountMenu loginHref="/login" />;
  }

  return (
    <AccountMenu
      email={auth.viewAs?.email ?? auth.email}
      profileName={auth.profile?.name ?? null}
    />
  );
}
