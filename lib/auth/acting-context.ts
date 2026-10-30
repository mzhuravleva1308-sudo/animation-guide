import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getAdminAccessStatus } from "@/lib/auth/require-admin";
import { getUserDisplayEmail } from "@/lib/auth/user-display";
import {
  normalizeViewAsUserId,
  VIEW_AS_USER_COOKIE_NAME,
} from "@/lib/auth/view-as";

export type ActingProfile = {
  id: string;
  name: string | null;
  slug: string;
};

export type ActingAuthContext = {
  /** Real signed-in auth user (admin when view-as is active). */
  sessionUserId: string;
  sessionEmail: string;
  /** Auth user whose library/ratings we act as. */
  actingUserId: string;
  actingEmail: string;
  actingProfile: ActingProfile | null;
  isViewAs: boolean;
};

async function loadProfileForUserId(
  userId: string
): Promise<ActingProfile | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, slug")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id || !data.slug) {
    return null;
  }

  return {
    id: data.id,
    name: data.name ?? null,
    slug: data.slug,
  };
}

/**
 * Resolve the effective (acting) user for catalog personalization and
 * profile mutations. View-as cookie is honored only for the real admin.
 */
export async function getActingAuthContext(): Promise<ActingAuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const sessionEmail = getUserDisplayEmail(user);
  const access = await getAdminAccessStatus();
  const cookieStore = await cookies();
  const rawViewAs = cookieStore.get(VIEW_AS_USER_COOKIE_NAME)?.value;
  const viewAsUserId =
    access === "admin" ? normalizeViewAsUserId(rawViewAs) : null;

  if (!viewAsUserId || viewAsUserId === user.id) {
    const actingProfile = await loadProfileForUserId(user.id);
    return {
      sessionUserId: user.id,
      sessionEmail,
      actingUserId: user.id,
      actingEmail: sessionEmail,
      actingProfile,
      isViewAs: false,
    };
  }

  const admin = getAdminSupabase();
  const { data: target, error: targetError } =
    await admin.auth.admin.getUserById(viewAsUserId);

  if (targetError || !target.user) {
    // Stale cookie — fall back to the real session.
    const actingProfile = await loadProfileForUserId(user.id);
    return {
      sessionUserId: user.id,
      sessionEmail,
      actingUserId: user.id,
      actingEmail: sessionEmail,
      actingProfile,
      isViewAs: false,
    };
  }

  const actingProfile = await loadProfileForUserId(viewAsUserId);
  return {
    sessionUserId: user.id,
    sessionEmail,
    actingUserId: viewAsUserId,
    actingEmail: getUserDisplayEmail(target.user),
    actingProfile,
    isViewAs: true,
  };
}

/**
 * For mutation routes: require a session and resolve the acting profile id
 * (view-as target when admin cookie is set).
 */
export async function requireActingProfileId(): Promise<
  | {
      ok: true;
      profileId: string;
      actingUserId: string;
      sessionUserId: string;
      sessionEmail: string;
      isViewAs: boolean;
      admin: ReturnType<typeof getAdminSupabase>;
    }
  | {
      ok: false;
      status: 401 | 404 | 500;
      error: string;
      code?: string;
    }
> {
  let context: ActingAuthContext | null;
  try {
    context = await getActingAuthContext();
  } catch (error) {
    console.error("[acting-context] failed to resolve", error);
    return { ok: false, status: 500, error: "Could not resolve profile" };
  }

  if (!context) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  if (!context.actingProfile?.id) {
    return {
      ok: false,
      status: 404,
      error: "No profile found for this account",
      code: "profile_not_found",
    };
  }

  return {
    ok: true,
    profileId: context.actingProfile.id,
    actingUserId: context.actingUserId,
    sessionUserId: context.sessionUserId,
    sessionEmail: context.sessionEmail,
    isViewAs: context.isViewAs,
    admin: getAdminSupabase(),
  };
}
