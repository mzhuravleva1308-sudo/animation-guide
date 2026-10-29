import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminAccessStatus } from "@/lib/auth/require-admin";
import { loadAdminUsers } from "@/lib/load-admin-users";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type AdminUsersPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const access = await getAdminAccessStatus();

  if (access === "unauthenticated") {
    redirect("/login");
  }

  if (access !== "admin") {
    notFound();
  }

  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser();

  const users = await loadAdminUsers();

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-gray-500 hover:text-black"
      >
        ← Back to library
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Users</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Sign in as a user to see their library and ratings. This replaces
            your admin session in this browser — sign out and magic-link back
            in as admin when you are done.
          </p>
          {error ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2 text-sm text-gray-500">
          <Link href="/admin/catalog-analytics" className="hover:text-black">
            Catalog analytics →
          </Link>
          <Link href="/admin/film-discovery" className="hover:text-black">
            Film discovery →
          </Link>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Profile</th>
              <th className="py-2 pr-4 font-medium">Signed up</th>
              <th className="py-2 pr-4 font-medium">Last sign-in</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-gray-500">
                  No auth users yet.
                </td>
              </tr>
            ) : (
              users.map((row) => {
                const isSelf = row.userId === adminUser?.id;
                return (
                  <tr
                    key={row.userId}
                    className="border-b border-gray-100 align-top"
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium text-gray-900">
                        {row.email ?? "(no email)"}
                      </div>
                      {isSelf ? (
                        <div className="mt-0.5 text-xs text-gray-500">You</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">
                      {row.profile ? (
                        <>
                          <div>{row.profile.name || "Unnamed"}</div>
                          <div className="text-xs text-gray-500">
                            /{row.profile.slug}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">No profile</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-600">
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-600">
                      {formatWhen(row.lastSignInAt)}
                    </td>
                    <td className="py-3 text-right">
                      {isSelf || !row.email ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <form
                          action="/api/admin/impersonate"
                          method="post"
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={row.userId}
                          />
                          <button
                            type="submit"
                            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-800 hover:border-black hover:bg-gray-50"
                          >
                            Log in as
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
