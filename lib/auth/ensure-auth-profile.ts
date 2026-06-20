import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureAuthProfileForUser as ensureAuthProfileForUserImpl } from "./ensure-auth-profile.mjs";

export type EnsuredAuthProfile = {
  id: string;
  slug: string;
  name: string | null;
  share_token: string;
  user_id: string;
};

export type EnsureAuthProfileResult = {
  profile: EnsuredAuthProfile;
  created: boolean;
};

export async function ensureAuthProfileForUser(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">
): Promise<EnsureAuthProfileResult> {
  return ensureAuthProfileForUserImpl(
    supabase,
    user
  ) as Promise<EnsureAuthProfileResult>;
}
