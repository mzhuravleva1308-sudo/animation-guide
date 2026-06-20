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

### Production deployment

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and other secrets in the **hosting provider’s environment UI**. Do not rely on committed env files for production.

Production SMTP lives in the **Supabase Dashboard** (Authentication → SMTP). It is never loaded from this repo.

Committed `.env.development` is not used when `NODE_ENV=production` unless those variables are already absent and Next.js loads files — on Vercel/CI, platform env vars are set explicitly and take precedence over files.

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
