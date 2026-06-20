import { createClient } from "@supabase/supabase-js";

type AuthUserLike = {
  id: string;
  email?: string | null;
};

export async function autoLinkE2eProfileForAuthUser(
  user: AuthUserLike
): Promise<boolean> {
  if (process.env.E2E_AUTO_LINK_AUTH_PROFILE !== "1") {
    return false;
  }

  const email = user.email?.trim().toLowerCase();
  if (!email?.endsWith("@example.test")) {
    return false;
  }

  const slug = process.env.E2E_PROFILE_SLUG?.trim();
  const token = process.env.E2E_PROFILE_TOKEN?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!slug || !token || !supabaseUrl || !serviceRoleKey) {
    return false;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .eq("share_token", token)
    .single();

  if (profileError || !profile?.id) {
    console.error("[e2e/auto-link] failed to load E2E profile", profileError);
    return false;
  }

  const { error: clearError } = await supabase
    .from("profiles")
    .update({ user_id: null })
    .eq("user_id", user.id);

  if (clearError) {
    console.error("[e2e/auto-link] failed to clear previous profile links", clearError);
    return false;
  }

  const { error: linkError } = await supabase
    .from("profiles")
    .update({ user_id: user.id })
    .eq("id", profile.id);

  if (linkError) {
    console.error("[e2e/auto-link] failed to link auth user to E2E profile", linkError);
    return false;
  }

  return true;
}
