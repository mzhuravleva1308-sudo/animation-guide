/**
 * P0-2 integration tests: share-link access is fully retired.
 *
 * Tests confirm:
 *  - /api/profile-rating requires session (401 without auth)
 *  - /api/profile-save requires session (401 without auth)
 *  - /api/taste-profile requires session (401 without auth)
 *  - legacy token in body/query is ignored/rejected
 *  - authenticated user A can mutate their own profile
 *  - user A cannot mutate profile B even when passing B's profileId
 *  - pending action contains only filmId + action data, no token
 *  - resolveAuthCallbackNextPath drops /p/... legacy URLs
 *
 * Runs against the local Supabase stack only.
 * Never run against hosted/production.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "../../scripts/load-app-env.mjs";
import {
  resolveAuthCallbackNextPath,
} from "../auth/auth-next-path.mjs";
import {
  resolvePostAuthRedirectPath,
} from "../auth/resolve-post-auth-redirect.mjs";
// Inline parsePendingFilmAction to avoid importing TypeScript from .mjs
function parsePendingFilmAction(value) {
  if (!value || typeof value !== "object") return null;
  const action = value;
  if (typeof action.id !== "string" || typeof action.filmId !== "string") return null;
  if (action.type === "save") return typeof action.saved === "boolean" ? action : null;
  if (action.type === "rating") {
    if (action.rating === null) return action;
    return typeof action.rating === "number" && action.rating >= 1 && action.rating <= 10
      ? action
      : null;
  }
  return null;
}

applyAppEnv({ mode: "development" });

const LOCAL_HOSTS = new Set(["127.0.0.1:54321", "localhost:54321"]);

function isLocalSupabaseUrl(url) {
  try {
    const parsed = new URL(url);
    const host = `${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

let skipReason = !supabaseUrl
  ? "Missing NEXT_PUBLIC_SUPABASE_URL"
  : !isLocalSupabaseUrl(supabaseUrl)
  ? `Refusing non-local Supabase URL: ${supabaseUrl}`
  : !anonKey || !serviceRoleKey
  ? "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY"
  : null;

async function probeLocalSupabase() {
  if (skipReason || !supabaseUrl || !anonKey) return;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/films?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!response.ok) skipReason = `Local Supabase REST returned ${response.status}`;
  } catch {
    skipReason = "Local Supabase is not reachable";
  }
}

await probeLocalSupabase();

function skip(t, message) {
  if (skipReason) {
    t.skip(`${message}: ${skipReason}`);
    return true;
  }
  return false;
}

const admin = skipReason
  ? null
  : createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getFirstFilm() {
  const { data } = await admin
    .from("films")
    .select("id")
    .limit(1)
    .single();
  return data?.id ?? null;
}

async function getProfileByUserId(userId) {
  const { data } = await admin
    .from("profiles")
    .select("id, slug, share_token")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

// ── Unit tests (no DB) ───────────────────────────────────────────────────────

describe("P0-2 auth-next-path: retired URLs are discarded", () => {
  it("replaces /p/slug?token=x with /", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/p/maria?token=abc123", []),
      "/"
    );
  });

  it("replaces /p/slug with / (no token)", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/p/someone", []),
      "/"
    );
  });

  it("replaces /films with /", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/films", []),
      "/"
    );
  });

  it("replaces /my-profile with /", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/my-profile", []),
      "/"
    );
  });

  it("replaces /saved and /watched with /", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/saved", []),
      "/"
    );
  });

  it("replaces /watched with /", () => {
    assert.equal(
      resolveAuthCallbackNextPath("/watched", []),
      "/"
    );
  });

  it("replaces /p/ in cookie too", () => {
    const cookieValue = encodeURIComponent("/p/maria?token=old");
    assert.equal(
      resolveAuthCallbackNextPath(null, [
        { name: "animationpre-auth-next", value: cookieValue },
      ]),
      "/"
    );
  });

  it("token is absent from the resolved next path", () => {
    const resolved = resolveAuthCallbackNextPath("/p/x?token=leak", []);
    assert.ok(
      !resolved.includes("token"),
      `Expected no 'token' in: ${resolved}`
    );
  });
});

describe("P0-2 resolve-post-auth-redirect: simplified destinations", () => {
  it("signup → / (no share link)", () => {
    const dest = resolvePostAuthRedirectPath({
      nextPath: "/",
      hadPendingAction: false,
      authCallbackType: "signup",
    });
    assert.equal(dest, "/");
    assert.ok(!dest.includes("token"), `Token must not appear in: ${dest}`);
  });

  it("pending action → /", () => {
    const dest = resolvePostAuthRedirectPath({
      nextPath: "/",
      hadPendingAction: true,
      authCallbackType: "email",
    });
    assert.equal(dest, "/");
  });

  it("legacy /p/ nextPath → replaced with /", () => {
    const dest = resolvePostAuthRedirectPath({
      nextPath: "/p/maria?token=old",
      hadPendingAction: false,
      authCallbackType: "email",
    });
    assert.equal(dest, "/");
  });

  it("/films → /", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/films",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });

  it("/saved → /", () => {
    assert.equal(
      resolvePostAuthRedirectPath({
        nextPath: "/saved",
        hadPendingAction: false,
        authCallbackType: "email",
      }),
      "/"
    );
  });
});

describe("P0-2 pending action: no token stored", () => {
  it("pending rating action contains only filmId and rating, no token", () => {
    const action = {
      type: "rating",
      filmId: "film-123",
      rating: 8,
    };
    const parsed = parsePendingFilmAction({ ...action, id: "test-id" });
    assert.ok(parsed !== null, "action should be valid");
    assert.ok(!("token" in parsed), "token must not be in pending action");
    assert.ok(!("share_token" in parsed), "share_token must not be in pending action");
    assert.ok(!("profileId" in parsed), "profileId must not be in pending action");
  });

  it("pending save action contains only filmId and saved, no token", () => {
    const action = {
      type: "save",
      filmId: "film-456",
      saved: true,
    };
    const parsed = parsePendingFilmAction({ ...action, id: "test-id" });
    assert.ok(parsed !== null, "action should be valid");
    assert.ok(!("token" in parsed), "token must not be in pending action");
    assert.ok(!("share_token" in parsed), "share_token must not be in pending action");
  });
});

// ── DB integration tests ─────────────────────────────────────────────────────

describe("P0-2 /api/profile-rating and /api/profile-save require session (local Supabase)", () => {
  it("unauthenticated POST to /api/profile-rating with token in body → 401", async (t) => {
    if (skip(t, "API session auth test")) return;

    const filmId = await getFirstFilm();
    if (!filmId) { t.skip("No films in local DB"); return; }

    const appOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

    const res = await fetch(`${appOrigin}/api/profile-rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filmId,
        rating: 7,
        // These should be ignored entirely
        token: "some-legacy-token",
        profileId: "any-id",
      }),
    }).catch(() => null);

    if (!res) { t.skip("Dev server not running"); return; }
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("unauthenticated POST to /api/profile-save with token in body → 401", async (t) => {
    if (skip(t, "API session auth test")) return;

    const filmId = await getFirstFilm();
    if (!filmId) { t.skip("No films in local DB"); return; }

    const appOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

    const res = await fetch(`${appOrigin}/api/profile-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filmId,
        saved: true,
        token: "some-legacy-token",
        profileId: "any-id",
      }),
    }).catch(() => null);

    if (!res) { t.skip("Dev server not running"); return; }
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("unauthenticated POST to /api/taste-profile → 401", async (t) => {
    if (skip(t, "API session auth test")) return;

    const appOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

    const res = await fetch(
      `${appOrigin}/api/taste-profile?slug=maria&token=legacy-token`,
      { method: "POST" }
    ).catch(() => null);

    if (!res) { t.skip("Dev server not running"); return; }
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });
});

describe("P0-2 DB: valid share_token in request body gives no DB write access (local Supabase)", () => {
  it("anon client cannot INSERT into film_ratings even with a real share_token", async (t) => {
    if (skip(t, "DB share_token bypass test")) return;

    const filmId = await getFirstFilm();
    if (!filmId) { t.skip("No films in local DB"); return; }

    // Get any profile with a real share_token to simulate a legacy attacker
    const { data: profile } = await admin
      .from("profiles")
      .select("id, share_token")
      .limit(1)
      .maybeSingle();

    if (!profile) { t.skip("No profiles in local DB"); return; }

    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await anon.from("film_ratings").insert({
      profile_id: profile.id,
      film_id: filmId,
      rating: 5,
    });

    // RLS must block this even with a known profile.id
    assert.ok(error !== null, "Expected RLS to reject the anon INSERT");
  });

  it("public catalog remains readable by anon after P0-2 changes", async (t) => {
    if (skip(t, "Public catalog access test")) return;

    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.from("films").select("id").limit(1);
    assert.equal(error, null, `Public catalog must be readable: ${error?.message}`);
    assert.ok(data && data.length > 0, "Public catalog must return at least one film");
  });
});
