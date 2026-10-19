"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const REFRESH_LOCK = "resonale-auth-refresh";
const EXPIRY_MARGIN_MS = 90_000;

async function refreshIfNeeded() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.expires_at) {
    return;
  }

  const msUntilExpiry = session.expires_at * 1000 - Date.now();
  if (msUntilExpiry > EXPIRY_MARGIN_MS) {
    return;
  }

  await supabase.auth.refreshSession();
}

async function withRefreshLock(fn: () => Promise<void>) {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) {
    await fn();
    return;
  }

  await locks.request(REFRESH_LOCK, fn);
}

/**
 * Coordinates client-side token refresh across tabs after long idle / reboot
 * so parallel auto-refreshes do not race the single-use refresh token.
 */
export default function AuthSessionKeeper() {
  useEffect(() => {
    void withRefreshLock(refreshIfNeeded);

    function onVisible() {
      if (document.visibilityState === "visible") {
        void withRefreshLock(refreshIfNeeded);
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
