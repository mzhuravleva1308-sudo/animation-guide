import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  // Only end this browser's session — do not revoke other devices.
  await supabase.auth.signOut({ scope: "local" });

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`);
}
