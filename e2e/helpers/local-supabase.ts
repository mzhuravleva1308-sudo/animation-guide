const LOCAL_SUPABASE_HOSTS = ["127.0.0.1:54321", "localhost:54321"] as const;

export function getSupabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = `${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
    return LOCAL_SUPABASE_HOSTS.includes(
      host as (typeof LOCAL_SUPABASE_HOSTS)[number]
    );
  } catch {
    return false;
  }
}

export function isLocalSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  return url ? isLocalSupabaseUrl(url) : false;
}

export function getLocalOtpAuthSkipReason(): string | null {
  if (!isLocalSupabaseConfigured()) {
    return "Requires local Supabase (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 from `supabase status -o env`).";
  }

  return null;
}
