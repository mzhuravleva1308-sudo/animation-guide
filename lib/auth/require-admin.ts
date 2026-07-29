import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  resolveAdminAccessStatus,
  type AdminAccessStatus,
} from "@/lib/auth/admin-access-status";
import { denyAdminApiAccess } from "@/lib/auth/admin-api-denial";

export type { AdminAccessStatus };

/**
 * Resolve whether the current request session is an admin.
 * Does not create a service-role client or log identifiers.
 */
export async function getAdminAccessStatus(): Promise<AdminAccessStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return resolveAdminAccessStatus(user?.id, process.env.ADMIN_USER_ID);
}

export async function requireAdminApiAccess(): Promise<
  | { ok: true }
  | { ok: false; status: 401 | 404; error: string }
> {
  const access = await getAdminAccessStatus();
  const denial = denyAdminApiAccess(access);

  if (denial) {
    return { ok: false, status: denial.status, error: denial.error };
  }

  return { ok: true };
}
