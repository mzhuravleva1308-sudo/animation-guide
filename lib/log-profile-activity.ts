import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ProfileActivityLogInput } from "@/lib/profile-activity-types";

let adminClient: SupabaseClient | null = null;
let missingConfigLogged = false;

function getAdminSupabase() {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      console.error(
        "Profile activity log failed: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

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
      console.error("Profile activity log insert failed:", {
        eventType: input.eventType,
        profileId: input.profileId,
        filmId: input.filmId ?? null,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
  } catch (error) {
    console.error("Profile activity log failed:", {
      eventType: input.eventType,
      profileId: input.profileId,
      filmId: input.filmId ?? null,
      error,
    });
  }
}
