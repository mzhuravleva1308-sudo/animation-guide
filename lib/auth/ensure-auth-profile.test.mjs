import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureAuthProfileForUser } from "./ensure-auth-profile.mjs";

/**
 * @param {{
 *   profileByUserId?: Record<string, unknown> | null;
 *   onUpdate?: (updates: Record<string, unknown>, profile: Record<string, unknown>) => Record<string, unknown>;
 *   onInsert?: (row: Record<string, unknown>) => { data: Record<string, unknown> | null; error: { code?: string; message?: string } | null };
 * }} config
 */
function createMockSupabase(config) {
  /** @type {Array<{ type: string; table: string; payload?: Record<string, unknown> }>} */
  const calls = [];

  const supabase = {
    calls,
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              if (column === "user_id" && table === "profiles") {
                return {
                  maybeSingle: async () => ({
                    data: config.profileByUserId ?? null,
                    error: null,
                  }),
                };
              }

              throw new Error(`Unexpected select.eq(${column}) on ${table}`);
            },
          };
        },
        update(updates) {
          calls.push({ type: "update", table, payload: updates });

          return {
            eq(column, value) {
              assert.equal(column, "id");

              return {
                eq(column2, value2) {
                  assert.equal(column2, "user_id");

                  return {
                    select() {
                      return {
                        single: async () => {
                          const profile = config.profileByUserId;
                          assert.ok(profile);

                          const nextProfile = config.onUpdate
                            ? config.onUpdate(updates, profile)
                            : { ...profile, ...updates };

                          config.profileByUserId = nextProfile;

                          return { data: nextProfile, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row) {
          calls.push({ type: "insert", table, payload: row });

          return {
            select() {
              return {
                single: async () => {
                  const result = config.onInsert?.(row) ?? {
                    data: { id: "new-profile", ...row },
                    error: null,
                  };

                  if (result.data) {
                    config.profileByUserId = result.data;
                  }

                  return result;
                },
              };
            },
          };
        },
      };
    },
  };

  return supabase;
}

describe("ensureAuthProfileForUser", () => {
  it("returns an existing linked profile without writes", async () => {
    const supabase = createMockSupabase({
      profileByUserId: {
        id: "profile-1",
        slug: "maria",
        name: "Maria",
        share_token: "share-token-123",
        user_id: "user-1",
      },
    });

    const result = await ensureAuthProfileForUser(supabase, {
      id: "user-1",
      email: "maria@example.com",
    });

    assert.equal(result.created, false);
    assert.equal(result.profile.slug, "maria");
    assert.equal(result.profile.share_token, "share-token-123");
    assert.equal(result.profile.name, "Maria");
    assert.deepEqual(
      supabase.calls.filter((call) => call.type === "update" || call.type === "insert"),
      []
    );
  });

  it("repairs only missing share_token without overwriting slug or name", async () => {
    const supabase = createMockSupabase({
      profileByUserId: {
        id: "profile-1",
        slug: "maria",
        name: "Maria",
        share_token: null,
        user_id: "user-1",
      },
      onUpdate: (updates, profile) => ({
        ...profile,
        ...updates,
        share_token: updates.share_token ?? "generated-token",
      }),
    });

    const result = await ensureAuthProfileForUser(supabase, {
      id: "user-1",
      email: "maria@example.com",
    });

    assert.equal(result.created, false);
    assert.equal(result.profile.slug, "maria");
    assert.equal(result.profile.name, "Maria");
    assert.ok(result.profile.share_token);
    assert.equal(supabase.calls.filter((call) => call.type === "update").length, 1);
    assert.deepEqual(
      Object.keys(
        supabase.calls.filter((call) => call.type === "update")[0]?.payload ?? {}
      ),
      ["share_token"]
    );
  });

  it("creates a new profile when no linked profile exists", async () => {
    const supabase = createMockSupabase({
      profileByUserId: null,
      onInsert: (row) => ({
        data: {
          id: "profile-new",
          slug: row.slug,
          name: row.name,
          share_token: row.share_token,
          user_id: row.user_id,
        },
        error: null,
      }),
    });

    const result = await ensureAuthProfileForUser(supabase, {
      id: "user-new",
      email: "new.user@example.com",
    });

    assert.equal(result.created, true);
    assert.equal(result.profile.user_id, "user-new");
    assert.match(result.profile.slug, /^new-user-/);
    assert.equal(supabase.calls.filter((call) => call.type === "insert").length, 1);
  });

  it("does not update ratings, saved lists, or taste data", async () => {
    const supabase = createMockSupabase({
      profileByUserId: {
        id: "profile-1",
        slug: "maria",
        name: "Maria",
        share_token: "share-token-123",
        user_id: "user-1",
      },
    });

    await ensureAuthProfileForUser(supabase, {
      id: "user-1",
      email: "maria@example.com",
    });

    assert.ok(
      supabase.calls.every(
        (call) => call.table === "profiles" || call.type !== "update"
      )
    );
    assert.equal(
      supabase.calls.filter((call) => call.table !== "profiles").length,
      0
    );
  });
});
