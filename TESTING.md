# Project testing convention

## Full local verification

```bash
npm test
```

**`npm test` is the full relevant local verification suite.** It runs, in order:

1. **`npm run test:unit`** — pure logic tests (`node --test` on `lib/**/*.test.mjs`)
2. **`npm run test:e2e`** — Playwright smoke and profile interaction tests

Run this before presenting or merging UI work. A cold run takes ~20s while Playwright builds and starts the E2E server.

Individual commands when iterating:

```bash
npm run test:unit   # scoring / cold-start logic only
npm run test:e2e    # browser tests only
npm run test:e2e:ui # Playwright UI mode (debugging)
npm run lint        # ESLint (not part of npm test)
```

## Before presenting changes

Anyone (human or agent) presenting a code change should:

1. Run the **relevant** checks for that change (`npm test` for UI/profile work; `npm run test:unit` if only pure lib logic changed; `npm run lint` if only lint-sensitive edits).
2. Report results explicitly:
   - **Passed** — what ran green
   - **Failed** — what failed and why (if not fixed yet)
   - **Skipped** — e.g. authenticated profile tests when E2E env or reset is missing
   - **Could not verify** — anything not run and why (missing env, no network, out of scope)

Do not claim tests passed without running them.

## E2E server (not `next dev`)

Playwright E2E tests **never** use `next dev`.

| Setting | Value |
|---------|--------|
| Command | `npm run build && npm run start -- -p 3100` |
| Port | **3100** (avoids clashing with local dev on 3000) |
| Config | `playwright.config.ts` → `webServer` |

Reason: the webpack dev client does not hydrate reliably in headless Playwright. Production `build && start` matches real runtime behavior.

Local manual browsing still uses `npm run dev` on port 3000. That is separate from E2E.

## E2E profile tests

Profile interaction tests use **only** the dedicated E2E test profile:

| Variable | Required for |
|----------|----------------|
| `E2E_PROFILE_SLUG` | Authenticated profile E2E tests |
| `E2E_PROFILE_TOKEN` | Authenticated profile E2E tests |

Set both in `.env.development` (committed) or `.env.local` for overrides — see [ENV.md](./ENV.md). They must come from a **dedicated test user's** private share link (`/p/{slug}?token=...`).

**Do not** point these at Maria's real profile or any non-test profile.

Tests that do **not** need these vars:

- Home, deprecated admin routes, and invalid-profile-link smoke tests

If slug/token or reset prerequisites are missing, authenticated profile tests **skip** (they do not fail the rest of the suite).

### Mutating the E2E profile

The E2E test profile **is allowed to be mutated** during tests (ratings, watchlist rows). Tests **must** clean up after themselves.

Cleanup is handled by `e2e/helpers/reset-e2e-profile.ts`:

| Hook | Purpose |
|------|---------|
| `beforeAll` | Clear E2E profile ratings + watchlist before the suite |
| `beforeEach` | Same reset so each interaction test starts clean |
| `afterAll` | Same reset so the profile is left clean for the next run |

Interaction tests also undo their own changes in-test (e.g. un-rate, unsave with reload verify).

**What reset deletes** (E2E profile only):

- `film_ratings` rows for that profile
- `profile_film_lists` rows where `list_type = 'to_watch'`

Films and the profile record itself are never deleted.

### Reset safety gates

The reset helper **refuses to run** unless:

1. `credentials.slug === E2E_PROFILE_SLUG`
2. `credentials.token === E2E_PROFILE_TOKEN`
3. A Supabase `profiles` row matches **both** that slug and share token

This prevents wiping any profile other than the dedicated E2E user.

### `SUPABASE_SERVICE_ROLE_KEY`

Required **only** for server-side E2E cleanup (`reset-e2e-profile.ts`), not for running the app or unit tests.

| Rule | Detail |
|------|--------|
| **Scope** | Playwright Node process and reset helper only |
| **Never in client code** | No `NEXT_PUBLIC_` prefix. Do not import the reset helper from `app/` or `components/`. App browser code uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `lib/supabase.ts`. |
| **Never commit** | Real value lives in `.env.development` (local) or deployment dashboard (production). Optional hosted scripts use `.env.hosted.local`. |

Offline `scripts/` may also use this key; same rules apply.

## Magic-link auth E2E (local Supabase + Mailpit)

Films auth E2E tests that send and verify magic links require:

1. **Local Supabase CLI stack** running (`supabase start`)
2. **Committed `.env.development`** — local Supabase URL and keys (automatic; see [ENV.md](./ENV.md))
3. **Mailpit reachable** at `MAILPIT_URL` (default `http://127.0.0.1:54324`)

### Setup commands

```bash
supabase start
supabase status          # human-readable; note Mailpit URL
supabase status -o env   # API_URL, ANON_KEY, SERVICE_ROLE_KEY, MAILPIT_URL
```

Then run E2E (env is loaded from `.env.development` + `.env.e2e`):

```bash
npm run test:e2e -- e2e/smoke/films-auth.spec.ts
```

### How E2E retrieves sign-in links

Tests use `e2e/helpers/mailpit.ts`:

1. UI requests a magic link through the real app (`signInWithOtp` with `emailRedirectTo`)
2. Helper polls Mailpit: `GET /api/v1/search?query=to:{email}`
3. Fetches the message body: `GET /api/v1/message/{ID}`
4. Extracts the confirmation URL with `lib/auth/extract-magic-link-from-email.mjs`
5. Playwright visits the URL; Supabase redirects through `/auth/callback` and establishes the session

There are **no hard-coded links** and **no production auth bypasses**. If local Supabase or Mailpit is unavailable, Mailpit-dependent tests **skip** with an explicit reason.

UI-only auth tests (modal open/close, login link visibility) still run without Mailpit.

`e2e/smoke/films-pending-action.spec.ts` runs **serially** because it shares one E2E profile. With `E2E_AUTO_LINK_AUTH_PROFILE=1` in `.env.e2e`, `/auth/callback` links `@example.test` users to the E2E profile before applying pending save/rating actions.

After changing `supabase/templates/email-magic-link.html`, restart the local stack (`npx supabase stop && npx supabase start`) so Mailpit receives link emails instead of OTP codes.

## Stable UI selectors

Profile E2E tests prefer:

- `data-testid="film-list"`, `film-card`, `profile-tab-empty`
- Roles and accessible names for buttons and headings

Prefer empty-tab checks via `profile-tab-empty` and card counts over exact copy strings.
