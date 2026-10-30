import { getActingAuthContext } from "@/lib/auth/acting-context";

export type LinkedProfile = {
  id: string;
  name: string;
  slug: string;
};

export type AuthUserSummary = {
  /** Display / gate email: session email (admin stays allowlisted while view-as). */
  email: string;
  /** Library being shown — acting profile when view-as is on. */
  profile: LinkedProfile | null;
  viewAs: {
    userId: string;
    email: string;
  } | null;
};

export async function getAuthUserSummary(): Promise<AuthUserSummary | null> {
  const context = await getActingAuthContext();
  if (!context) {
    return null;
  }

  return {
    email: context.sessionEmail,
    profile: context.actingProfile
      ? {
          id: context.actingProfile.id,
          name: context.actingProfile.name ?? context.actingProfile.slug,
          slug: context.actingProfile.slug,
        }
      : null,
    viewAs: context.isViewAs
      ? {
          userId: context.actingUserId,
          email: context.actingEmail,
        }
      : null,
  };
}
