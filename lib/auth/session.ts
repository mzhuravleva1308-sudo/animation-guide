import { createClient } from "@/lib/supabase/server";
import { getUserDisplayEmail } from "@/lib/auth/user-display";

export type LinkedProfile = {
  id: string;
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
    .select("id, name, slug")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    email: getUserDisplayEmail(user),
    profile: profile?.id && profile.slug
      ? {
          id: profile.id,
          name: profile.name ?? profile.slug,
          slug: profile.slug,
        }
      : null,
  };
}
