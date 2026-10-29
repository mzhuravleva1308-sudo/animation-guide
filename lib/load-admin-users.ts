import "server-only";

import { getAdminSupabase } from "@/lib/supabase/admin";

export type AdminUserRow = {
  userId: string;
  email: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
  profile: {
    id: string;
    name: string | null;
    slug: string;
    createdAt: string;
  } | null;
};

async function listAuthUsersById(
  admin: ReturnType<typeof getAdminSupabase>
): Promise<
  Map<
    string,
    { email: string | null; lastSignInAt: string | null; createdAt: string | null }
  >
> {
  const byId = new Map<
    string,
    { email: string | null; lastSignInAt: string | null; createdAt: string | null }
  >();

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;

    const users = data?.users ?? [];
    for (const user of users) {
      byId.set(user.id, {
        email: user.email ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        createdAt: user.created_at ?? null,
      });
    }

    if (users.length < 200) break;
  }

  return byId;
}

/**
 * Linked guide profiles plus auth emails for the admin users page.
 * Newest auth accounts first; profiles without auth are omitted.
 */
export async function loadAdminUsers(): Promise<AdminUserRow[]> {
  const admin = getAdminSupabase();

  const [{ data: profiles, error: profilesError }, authById] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, name, slug, user_id, created_at")
        .not("user_id", "is", null)
        .order("created_at", { ascending: false }),
      listAuthUsersById(admin),
    ]);

  if (profilesError) throw profilesError;

  const profileByUserId = new Map<
    string,
    {
      id: string;
      name: string | null;
      slug: string;
      createdAt: string;
    }
  >();

  for (const row of profiles ?? []) {
    const userId = typeof row.user_id === "string" ? row.user_id : null;
    if (!userId || profileByUserId.has(userId)) continue;
    profileByUserId.set(userId, {
      id: row.id,
      name: row.name ?? null,
      slug: row.slug,
      createdAt: row.created_at,
    });
  }

  const rows: AdminUserRow[] = [];

  for (const [userId, auth] of authById) {
    rows.push({
      userId,
      email: auth.email,
      lastSignInAt: auth.lastSignInAt,
      createdAt: auth.createdAt,
      profile: profileByUserId.get(userId) ?? null,
    });
  }

  rows.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });

  return rows;
}
