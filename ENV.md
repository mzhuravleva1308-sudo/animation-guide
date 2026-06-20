# Environment variables

This project separates **local stack** (Supabase CLI + Mailpit), **personal secrets**, and **hosted production** so you never swap Supabase URLs in one file.

## Quick start (local dev)

```bash
npx supabase start
npm run dev
```

`npm run dev` always targets `http://127.0.0.1:54321` and Mailpit. Put API keys in `.env.local` only — not hosted Supabase values.

## Files

| File | Committed? | Loaded by |
|------|------------|-----------|
| `.env.development` | **Yes** | `npm run dev`, local scripts, E2E (base layer) |
| `.env.e2e` | **Yes** | Playwright E2E only (site URL for port 3100) |
| `.env.example` | **Yes** | Documentation template |
| `.env.hosted.example` | **Yes** | Template for `.env.hosted.local` |
| `.env.local` | **No** (gitignored) | Personal secrets: `OPENAI_API_KEY`, `TMDB_API_KEY`, etc. |
| `.env.hosted.local` | **No** (gitignored) | Hosted Supabase for **scripts only** (`APP_ENV=hosted`) |
| Hosting dashboard (Vercel, etc.) | N/A | **Production** `next build` / `next start` deploys |

Never commit `.env.local`, `.env.hosted.local`, or real production keys.

## Precedence

### `npm run dev` (`scripts/run-dev.mjs`)

1. Start from the current process environment.
2. Apply **`.env.development`** (local Supabase URL, anon key, service role, Mailpit, E2E seed tokens).
3. Apply **`.env.local`**, but **ignore** any `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, or `MAILPIT_URL` entries so hosted values cannot override the local stack.
4. Pass the merged env to `next dev`. Next.js does not overwrite variables already set in the process environment.

**Why localhost cannot send real auth emails:** the app always talks to `http://127.0.0.1:54321`. That instance has no production SMTP — Auth emails go to Mailpit on `http://127.0.0.1:54324`. Even if `.env.local` still contains old hosted Supabase URLs, they are stripped before the dev server starts.

### Playwright E2E (`playwright.config.ts`)

1. **`.env.development`**
2. **`.env.e2e`** (sets `NEXT_PUBLIC_SITE_URL` for port 3100)
3. **`.env.local`** (secrets only; same Supabase/Mailpit blocklist as dev)

The merged env is applied to the test process and passed to the `webServer` (`npm run build && npm run start`) so `NEXT_PUBLIC_*` values are baked into the production build used by E2E.

### Local scripts (`scripts/*.mjs`)

Default: same as development (`.env.development` + filtered `.env.local`).

Hosted catalog scripts:

```bash
APP_ENV=hosted node scripts/cache-posters.mjs
```

Requires `.env.hosted.local` (copy from `.env.hosted.example`).

### Production deployment (Vercel / hosting)

**Required in Production *and* Preview** (hosting dashboard — not repo files):

| Variable | Example shape | Notes |
|----------|---------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Hosted Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT anon key from Supabase Dashboard | Baked into client bundle at build time |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | Canonical public origin (https, no trailing slash) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role JWT | Server-only; optional for some features, required for admin scripts |

**Do not set** `ALLOW_LOCAL_STACK_ENV` in Production or Preview. That flag exists only in `.env.e2e` for Playwright builds.

**Build guard:** `npm run build` and `next.config.ts` call `validateProductionBuildEnv`. A production build **fails** if:

- any required var above is missing;
- `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SITE_URL` points at `localhost` / `127.0.0.1`;
- hosted URLs are not `https://`.

Inspect what the current shell would use (no secrets printed):

```bash
NODE_ENV=production npm run env:inspect
```

#### Why local values leaked before

1. **Committed `.env.development`** contains local Supabase/Mailpit URLs — safe for dev/E2E only. Next.js **does not** load it when `NODE_ENV=production`, but values copied into the **Vercel env UI** or baked from a **local `npm run build`** without hosted vars will still reach users.
2. **E2E** intentionally runs `next build` with local env via `scripts/run-e2e-webserver.mjs` + `scripts/load-app-env.mjs` — never deploy that artifact.
3. **Missing `NEXT_PUBLIC_SITE_URL`** on the host caused code paths to fall back to `http://localhost:3000` when no request origin exists (see `lib/auth/callback-origin.mjs`).
4. **Supabase Dashboard → Authentication → URL configuration**: Site URL and Redirect URLs must list your **production domain**, not `http://127.0.0.1:3000`. Otherwise auth emails can ignore `emailRedirectTo` and point at localhost even when the app env is correct.

#### What cannot reach production after this change

| Source | Production build |
|--------|------------------|
| `.env.development` | Not loaded by Next.js (`NODE_ENV=production`) |
| `.env.e2e` | Not loaded (E2E only via `loadAppEnv`) |
| `.env.local` | Gitignored; not on Vercel unless manually uploaded |
| `scripts/load-app-env.mjs` | Not invoked by `next build` on Vercel |
| Localhost fallbacks | Build fails unless `ALLOW_LOCAL_STACK_ENV=1` (E2E only) |

Production SMTP lives in the **Supabase Dashboard** (Authentication → SMTP). It is never loaded from this repo.

## `.env.local` (secrets only)

Copy from `.env.example`. Example:

```bash
OPENAI_API_KEY=sk-...
TMDB_API_KEY=...
```

Do **not** put hosted Supabase URLs here. If you still have them from an older setup, `npm run dev` ignores them and prints a warning.

## Migrating from the old single-file setup

1. Remove `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, and `MAILPIT_URL` from `.env.local`.
2. Keep `OPENAI_API_KEY`, `TMDB_API_KEY`, and any other personal keys.
3. Optional: move hosted Supabase keys to `.env.hosted.local` for `APP_ENV=hosted` scripts.
4. Set production values in your deployment dashboard only.

## Regenerating local keys

Default CLI keys are stable and committed in `.env.development`. If you change JWT secrets in `supabase/config.toml`, run `supabase status -o env` and update `.env.development` to match `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY`.
