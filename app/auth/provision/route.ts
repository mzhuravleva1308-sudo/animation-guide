import { ensureAuthProfileForUser } from "@/lib/auth/ensure-auth-profile";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        auth_error: "not_authenticated",
        message: "Your session has expired. Please sign in again.",
      },
      { status: 401 }
    );
  }

  try {
    const { profile } = await ensureAuthProfileForUser(supabase, user);

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        slug: profile.slug,
      },
    });
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "profile_provision_failed";
    const message = error instanceof Error ? error.message : "unknown error";

    console.error("[auth/provision] failed to ensure auth profile", {
      userId: user.id,
      errorCode,
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        auth_error: "profile_provision_failed",
        message: "We signed you in, but couldn't set up your personal guide.",
      },
      { status: 500 }
    );
  }
}
