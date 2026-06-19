import Link from "next/link";
import { getAuthUserSummary } from "@/lib/auth/session";

export default async function AuthStatus() {
  const auth = await getAuthUserSummary();

  if (!auth) {
    return (
      <nav className="text-sm text-gray-600" data-testid="auth-status">
        <Link href="/login" className="hover:text-gray-900">
          Log in
        </Link>
      </nav>
    );
  }

  return (
    <div
      className="flex items-center gap-3 text-sm text-gray-600"
      data-testid="auth-status"
    >
      <span data-testid="auth-email">
        {auth.email}
        {auth.profile ? (
          <>
            {" · "}
            <Link
              href="/my-profile"
              className="hover:text-gray-900"
              data-testid="auth-profile-name"
            >
              {auth.profile.name}
            </Link>
          </>
        ) : (
          <span className="text-gray-400" data-testid="auth-no-profile">
            {" "}
            · no profile linked
          </span>
        )}
      </span>
      <form action="/auth/logout" method="post">
        <button
          type="submit"
          className="text-gray-600 hover:text-gray-900"
          data-testid="auth-logout"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
