import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ProfileActivityLogInput } from "@/lib/profile-activity-types";

let adminClient: SupabaseClient | null = null;

function getAdminSupabase() {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey);

  return adminClient;
}

export async function logProfileActivity(input: ProfileActivityLogInput) {
  try {
    const adminSupabase = getAdminSupabase();

    if (!adminSupabase) {
      return;
    }

    const { error } = await adminSupabase.from("profile_activity_logs").insert({
      profile_id: input.profileId,
      film_id: input.filmId ?? null,
      event_type: input.eventType,
      event_data: input.eventData ?? {},
      user_agent: input.userAgent ?? null,
      referrer: input.referrer ?? null,
    });

    if (error) {
      console.error("Profile activity log failed:", error.message);
    }
  } catch (error) {
    console.error("Profile activity log failed:", error);
  }
}
