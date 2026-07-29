import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Profile share-links (/p/[slug]?token=...) are no longer supported.
// All user data is accessed through authenticated sessions only.
// This route issues a permanent server-side redirect without inspecting the
// token or the slug — both are discarded to avoid leaking any information.
export default async function ProfilePage() {
  redirect("/login?error=profile_link_retired");
}
