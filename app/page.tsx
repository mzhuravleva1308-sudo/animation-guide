import { redirect } from "next/navigation";
import AccountMenuSlot from "@/components/AccountMenuSlot";
import { getAuthUserSummary } from "@/lib/auth/session";
import { POST_AUTH_PATH } from "@/lib/auth/post-auth-path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const auth = await getAuthUserSummary();

  if (auth?.profile) {
    redirect(POST_AUTH_PATH);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-3xl font-semibold">Animation Guide</h1>
        <AccountMenuSlot />
      </div>

      <p className="mt-3 text-gray-600">
        Personal animation guides are available by private link.
      </p>
    </main>
  );
}
