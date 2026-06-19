import Link from "next/link";
import { redirect } from "next/navigation";
import AccountMenuSlot from "@/components/AccountMenuSlot";
import { createClient } from "@/lib/supabase/server";
import { getUserDisplayEmail } from "@/lib/auth/user-display";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, share_token, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.slug && profile.share_token) {
    const profileUrl = `/p/${profile.slug}?token=${encodeURIComponent(profile.share_token)}`;
    redirect(profileUrl);
  }

  const displayEmail = getUserDisplayEmail(user);

  return (
    <main className="mx-auto max-w-md p-8" data-testid="my-profile-empty">
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-2xl font-semibold">My profile</h1>
        <AccountMenuSlot />
      </div>
      <p className="mt-3 text-sm text-gray-600">
        No animation guide is linked to your account yet.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Signed in as {displayEmail}. When a profile is linked to your user, this
        page will open your guide automatically.
      </p>
      <p className="mt-6 text-sm text-gray-600">
        <Link href="/" className="text-gray-900 hover:underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}
