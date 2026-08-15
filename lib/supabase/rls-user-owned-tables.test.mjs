/**
 * Local Supabase RLS integration tests for P0-1 user-owned tables.
 *
 * Skips unless NEXT_PUBLIC_SUPABASE_URL points at the local CLI stack.
 * Never run against hosted/production.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "../../scripts/load-app-env.mjs";

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
  if (skipReason || !supabaseUrl || !anonKey) {
    return;
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/films?select=id&limit=1`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (!response.ok && response.status !== 200) {
      // 200 with empty body is fine; permission errors still mean the API is up.
      if (response.status >= 500) {
        skipReason = `Local Supabase API unavailable (HTTP ${response.status}). Start it with: npx supabase start`;
      }
    }
  } catch (error) {
    skipReason = `Local Supabase unreachable (${error instanceof Error ? error.message : "unknown"}). Start it with: npx supabase start`;
  }
}

await probeLocalSupabase();

const suite = skipReason ? describe.skip : describe;

suite("RLS user-owned tables (local Supabase)", () => {
  /** @type {import("@supabase/supabase-js").SupabaseClient} */
  let admin;
  /** @type {import("@supabase/supabase-js").SupabaseClient} */
  let anon;
  /** @type {{ id: string; email: string; password: string; profileId: string; shareToken: string } | null} */
  let userA = null;
  /** @type {{ id: string; email: string; password: string; profileId: string; shareToken: string } | null} */
  let userB = null;
  /** @type {string | null} */
  let filmId = null;
  /** @type {string[]} */
  const createdUserIds = [];

  async function createAuthedClient(email, password) {
    const client = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    assert.ifError(error);
    assert.ok(data.session, "expected session for authenticated client");
    return client;
  }

  async function createTestUser(label) {
    const email = `rls-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const password = "rls-test-password-123";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    assert.ok(data.user?.id);
    createdUserIds.push(data.user.id);

    const shareToken = crypto.randomUUID();
    const slug = `rls-${label}-${data.user.id.replace(/-/g, "").slice(0, 12)}`;
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        user_id: data.user.id,
        slug,
        share_token: shareToken,
        name: `RLS ${label}`,
        taste_profile: `private taste for ${label}`,
      })
      .select("id, user_id, slug, share_token, taste_profile")
      .single();
    assert.ifError(profileError);
    assert.ok(profile?.id);

    return {
      id: data.user.id,
      email,
      password,
      profileId: profile.id,
      shareToken,
    };
  }

  before(async () => {
    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    anon = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { data: film, error: filmError } = await admin
      .from("films")
      .select("id")
      .limit(1)
      .maybeSingle();
    assert.ifError(filmError);
    assert.ok(film?.id, "seeded films required for RLS rating/save tests");
    filmId = film.id;

    userA = await createTestUser("a");
    userB = await createTestUser("b");

    const { error: ratingError } = await admin.from("film_ratings").insert({
      profile_id: userB.profileId,
      film_id: filmId,
      rating: 8,
    });
    assert.ifError(ratingError);

    const { error: listError } = await admin.from("profile_film_lists").insert({
      profile_id: userB.profileId,
      film_id: filmId,
      list_type: "to_watch",
    });
    assert.ifError(listError);

    const { error: coreError } = await admin.from("profile_taste_cores").insert({
      profile_id: userB.profileId,
      media_type: "animation",
      core_type: "emotional",
      core_index: 0,
      name: "B private core",
      strength: 1,
    });
    assert.ifError(coreError);

    const { error: coreAError } = await admin.from("profile_taste_cores").insert({
      profile_id: userA.profileId,
      media_type: "animation",
      core_type: "emotional",
      core_index: 0,
      name: "A private core",
      strength: 1,
    });
    assert.ifError(coreAError);
  });

  after(async () => {
    if (!admin) {
      return;
    }

    for (const user of [userA, userB]) {
      if (user?.profileId) {
        await admin.from("profiles").delete().eq("id", user.profileId);
      }
    }

    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("anon cannot SELECT share_token from profiles", async () => {
    const { data, error } = await anon
      .from("profiles")
      .select("share_token")
      .limit(5);

    assert.equal(data == null || data.length === 0, true);
    assert.ok(error, "expected anon select of share_token to fail");
  });

  it("anon cannot read private profiles fields", async () => {
    const { data, error } = await anon
      .from("profiles")
      .select("id, user_id, taste_profile, share_token, slug")
      .eq("id", userA.profileId)
      .maybeSingle();

    assert.equal(data, null);
    assert.ok(error);
  });

  it("authenticated user A can read own profile including private fields", async () => {
    const client = await createAuthedClient(userA.email, userA.password);
    const { data, error } = await client
      .from("profiles")
      .select("id, user_id, share_token, taste_profile, slug")
      .eq("user_id", userA.id)
      .single();

    assert.ifError(error);
    assert.equal(data.id, userA.profileId);
    assert.equal(data.user_id, userA.id);
    assert.equal(data.share_token, userA.shareToken);
    assert.match(data.taste_profile ?? "", /private taste for a/);
  });

  it("user A cannot read private profile of user B", async () => {
    const client = await createAuthedClient(userA.email, userA.password);
    const { data, error } = await client
      .from("profiles")
      .select("id, user_id, share_token, taste_profile")
      .eq("id", userB.profileId)
      .maybeSingle();

    assert.equal(data, null);
    // PostgREST may return PGRST116 (0 rows) or an RLS-shaped empty result.
    assert.equal(data, null);
    void error;
  });

  it("user A can read own ratings and not user B ratings", async () => {
    const client = await createAuthedClient(userA.email, userA.password);

    const { error: ownInsertError } = await client.from("film_ratings").upsert(
      {
        film_id: filmId,
        profile_id: userA.profileId,
        rating: 7,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "film_id,profile_id" }
    );
    assert.ifError(ownInsertError);

    const { data: ownRatings, error: ownError } = await client
      .from("film_ratings")
      .select("film_id, rating, profile_id")
      .eq("profile_id", userA.profileId);
    assert.ifError(ownError);
    assert.ok((ownRatings ?? []).some((row) => row.film_id === filmId));

    const { data: foreignRatings, error: foreignError } = await client
      .from("film_ratings")
      .select("film_id, rating, profile_id")
      .eq("profile_id", userB.profileId);
    assert.ifError(foreignError);
    assert.deepEqual(foreignRatings ?? [], []);
  });

  it("user A cannot INSERT rating with profile_id of user B", async () => {
    const client = await createAuthedClient(userA.email, userA.password);
    const { error } = await client.from("film_ratings").insert({
      film_id: filmId,
      profile_id: userB.profileId,
      rating: 3,
    });
    assert.ok(error, "expected insert with foreign profile_id to fail");
  });

  it("user A cannot UPDATE rating of user B", async () => {
    const client = await createAuthedClient(userA.email, userA.password);
    const { data, error } = await client
      .from("film_ratings")
      .update({ rating: 1 })
      .eq("profile_id", userB.profileId)
      .eq("film_id", filmId)
      .select("id");

    assert.deepEqual(data ?? [], []);
    void error;
  });

  it("user A cannot DELETE rating of user B", async () => {
    const client = await createAuthedClient(userA.email, userA.password);
    const { data, error } = await client
      .from("film_ratings")
      .delete()
      .eq("profile_id", userB.profileId)
      .eq("film_id", filmId)
      .select("id");

    assert.deepEqual(data ?? [], []);
    void error;

    const { data: stillThere, error: checkError } = await admin
      .from("film_ratings")
      .select("id")
      .eq("profile_id", userB.profileId)
      .eq("film_id", filmId)
      .maybeSingle();
    assert.ifError(checkError);
    assert.ok(stillThere?.id);
  });

  it("ownership checks for profile_film_lists", async () => {
    const client = await createAuthedClient(userA.email, userA.password);

    const { error: saveError } = await client.from("profile_film_lists").insert({
      film_id: filmId,
      profile_id: userA.profileId,
      list_type: "to_watch",
    });
    assert.ifError(saveError);

    const { data: ownLists, error: ownError } = await client
      .from("profile_film_lists")
      .select("film_id, profile_id")
      .eq("profile_id", userA.profileId)
      .eq("list_type", "to_watch");
    assert.ifError(ownError);
    assert.ok((ownLists ?? []).some((row) => row.film_id === filmId));

    const { data: foreignLists, error: foreignError } = await client
      .from("profile_film_lists")
      .select("film_id, profile_id")
      .eq("profile_id", userB.profileId);
    assert.ifError(foreignError);
    assert.deepEqual(foreignLists ?? [], []);

    const { error: foreignInsertError } = await client
      .from("profile_film_lists")
      .insert({
        film_id: filmId,
        profile_id: userB.profileId,
        list_type: "to_watch",
      });
    assert.ok(foreignInsertError);

    const { data: updateData } = await client
      .from("profile_film_lists")
      .update({ list_type: "to_watch" })
      .eq("profile_id", userB.profileId)
      .eq("film_id", filmId)
      .select("id");
    assert.deepEqual(updateData ?? [], []);

    const { data: deleteData } = await client
      .from("profile_film_lists")
      .delete()
      .eq("profile_id", userB.profileId)
      .eq("film_id", filmId)
      .select("id");
    assert.deepEqual(deleteData ?? [], []);
  });

  it("user A can read own profile_taste_cores and not user B", async () => {
    const client = await createAuthedClient(userA.email, userA.password);

    const { data: ownCores, error: ownError } = await client
      .from("profile_taste_cores")
      .select("name, profile_id")
      .eq("profile_id", userA.profileId);
    assert.ifError(ownError);
    assert.ok((ownCores ?? []).some((row) => row.name === "A private core"));

    const { data: foreignCores, error: foreignError } = await client
      .from("profile_taste_cores")
      .select("name, profile_id")
      .eq("profile_id", userB.profileId);
    assert.ifError(foreignError);
    assert.deepEqual(foreignCores ?? [], []);
  });

  it("anon has no access to user-owned tables", async () => {
    for (const table of [
      "profiles",
      "film_ratings",
      "profile_film_lists",
      "profile_taste_cores",
    ]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      assert.equal(
        data == null || data.length === 0,
        true,
        `anon should not read ${table}`
      );
      assert.ok(error, `expected anon error on ${table}`);
    }
  });

  it("public film catalog remains readable by anon", async () => {
    const { data, error } = await anon
      .from("films")
      .select("id, title")
      .limit(1);

    assert.ifError(error);
    assert.ok(data && data.length === 1);
  });

  it("authenticated rating and save flow continues to work for owner", async () => {
    const client = await createAuthedClient(userA.email, userA.password);

    const { error: rateError } = await client.from("film_ratings").upsert(
      {
        film_id: filmId,
        profile_id: userA.profileId,
        rating: 9,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "film_id,profile_id" }
    );
    assert.ifError(rateError);

    const { data: rating, error: ratingReadError } = await client
      .from("film_ratings")
      .select("rating")
      .eq("profile_id", userA.profileId)
      .eq("film_id", filmId)
      .single();
    assert.ifError(ratingReadError);
    assert.equal(rating.rating, 9);

    const { data: existingSave } = await client
      .from("profile_film_lists")
      .select("id")
      .eq("profile_id", userA.profileId)
      .eq("film_id", filmId)
      .eq("list_type", "to_watch")
      .maybeSingle();

    if (!existingSave) {
      const { error: saveError } = await client.from("profile_film_lists").insert({
        film_id: filmId,
        profile_id: userA.profileId,
        list_type: "to_watch",
      });
      assert.ifError(saveError);
    }

    const { error: unsaveError } = await client
      .from("profile_film_lists")
      .delete()
      .eq("profile_id", userA.profileId)
      .eq("film_id", filmId)
      .eq("list_type", "to_watch");
    assert.ifError(unsaveError);

    const { error: clearRatingError } = await client
      .from("film_ratings")
      .delete()
      .eq("profile_id", userA.profileId)
      .eq("film_id", filmId);
    assert.ifError(clearRatingError);
  });
});

if (skipReason) {
  describe("RLS user-owned tables (skipped)", () => {
    it(`skipped: ${skipReason}`, () => {
      assert.ok(true);
    });
  });
}
