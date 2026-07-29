/**
 * Map admin access status to an API denial response.
 * Unauthenticated → 401; non-admin (including missing ADMIN_USER_ID) → 404.
 *
 * @param {"unauthenticated" | "authenticated_non_admin" | "admin"} access
 * @returns {{ status: 401 | 404; error: string } | null}
 */
export function denyAdminApiAccess(access) {
  if (access === "unauthenticated") {
    return { status: 401, error: "Authentication required" };
  }

  if (access !== "admin") {
    return { status: 404, error: "Not found" };
  }

  return null;
}
