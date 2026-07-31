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

  // Do not steal users already linked to a project-specific E2E profile
  // (e.g. e2e-test-chromium used by smoke profile tests).
  const { data: existingLink } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingLink?.id) {
    return true;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .eq("share_token", token)
    .maybeSingle();

  // Token can drift between .env.local and the seeded E2E profile. Fall back to
  // slug-only lookup while E2E auto-link is explicitly enabled.
  const profileId =
    profile?.id ??
    (
      await supabase
        .from("profiles")
        .select("id")
        .eq("slug", slug)
        .maybeSingle()
    ).data?.id;

  if (profileError || !profileId) {
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
    .eq("id", profileId);

  if (linkError) {
    console.error("[e2e/auto-link] failed to link auth user to E2E profile", linkError);
    return false;
  }

  return true;
}
