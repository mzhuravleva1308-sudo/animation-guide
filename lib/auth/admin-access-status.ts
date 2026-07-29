export { resolveAdminAccessStatus } from "./admin-access-status.mjs";

export type AdminAccessStatus =
  | "unauthenticated"
  | "authenticated_non_admin"
  | "admin";
