/**
 * Pure admin access resolution (no I/O).
 * Admin only when userId exactly equals the configured ADMIN_USER_ID.
 * Missing/empty ADMIN_USER_ID → deny (treated as non-admin when authenticated).
 *
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} adminUserId
 * @returns {"unauthenticated" | "authenticated_non_admin" | "admin"}
 */
export function resolveAdminAccessStatus(userId, adminUserId) {
  if (!userId) {
    return "unauthenticated";
  }

  const configured = typeof adminUserId === "string" ? adminUserId.trim() : "";

  if (!configured || userId !== configured) {
    return "authenticated_non_admin";
  }

  return "admin";
}
