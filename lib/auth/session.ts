import { createClient } from "@/lib/supabase/server";
import { getUserDisplayEmail } from "@/lib/auth/user-display";

export type LinkedProfile = {
  name: string;
  slug: string;
};

export type AuthUserSummary = {
  email: string;
  profile: LinkedProfile | null;
};

export async function getAuthUserSummary(): Promise<AuthUserSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, slug")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    email: getUserDisplayEmail(user),
    profile: profile ?? null,
  };
}
