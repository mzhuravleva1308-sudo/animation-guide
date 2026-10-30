import Link from "next/link";
import { getActingAuthContext } from "@/lib/auth/acting-context";

export default async function ViewAsBanner() {
  let context;
  try {
    context = await getActingAuthContext();
  } catch {
    return null;
  }

  if (!context?.isViewAs) {
    return null;
  }

  const label =
    context.actingProfile?.name?.trim() ||
    context.actingEmail ||
    context.actingUserId;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          Viewing as <span className="font-medium">{label}</span>
          {context.actingProfile?.name && context.actingEmail ? (
            <span className="text-amber-800"> ({context.actingEmail})</span>
          ) : null}
          . Admin session is still active.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/admin/users" className="underline hover:no-underline">
            Users
          </Link>
          <form action="/api/admin/view-as/clear" method="post">
            <input type="hidden" name="next" value="/" />
            <button
              type="submit"
              className="rounded border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
            >
              Exit view as
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
