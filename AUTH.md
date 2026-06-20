# Authentication (Supabase)

Sign-in via Supabase Auth: email magic link, email/password, and optional OAuth (Apple, Google). No route protection, RLS, or admin roles in this layer.

## Supported methods

| Method | Client API | Session path |
|--------|------------|--------------|
| Email magic link | `signInWithOtp` with `emailRedirectTo` → user clicks link → `/auth/callback` | Callback session |
| Password sign-in | `signInWithPassword` | Immediate browser session |
| Password sign-up | `signUp` | Immediate session, or email confirmation → `/auth/callback` |
| OAuth (Apple, Google) | `signInWithOAuth` | Provider → `/auth/callback?code=...` |

Passwordless sign-in for this MVP uses **Supabase’s default magic-link email flow**. The app calls `signInWithOtp` with `emailRedirectTo` pointing at `/auth/callback?next=…`. The user opens the link in email; the shared callback route establishes the session.

Password sign-in creates the session directly in the browser. OAuth and legacy email-confirmation links also use `app/auth/callback/route.ts` (`exchangeCodeForSession` or `verifyOtp` with `token_hash`).

### Passwordless codes vs magic links (MVP choice)

| Flow | Email content | Hosted Supabase (no custom SMTP) | Custom SMTP required? |
|------|---------------|----------------------------------|------------------------|
| **Magic link (current MVP)** | Clickable `{{ .ConfirmationURL }}` | Works with Supabase’s built-in email provider | No |
| **6-digit email OTP** | `{{ .Token }}` entered in the app | Not supported reliably without template + delivery control | **Yes** — configure SMTP and a Magic Link template that exposes `{{ .Token }}` without `emailRedirectTo` |

This repo intentionally uses magic links for the MVP. Do not add OTP input UI unless you also configure custom SMTP and update the hosted Magic Link template accordingly.

After any successful sign-in, the account menu resolves the linked profile via `profiles.user_id`. Users without a linked profile still see their email in the menu.

Logout is always `POST /auth/logout` regardless of how the user signed in.

Unauthenticated browsing (home, `/films`, share-link profiles) is unchanged. Signed-in users with a linked profile are redirected from `/` to `/my-profile`, which opens their guide when `slug` and `share_token` are present.

After any successful sign-in (password, magic link, OAuth), the default destination is `/my-profile`. Callback-based flows pass `next=/my-profile` on `/auth/callback` (or `/films` when auth started from the films modal). Password sign-in navigates to `/my-profile` directly.

## Environment variables

Add personal secrets to `.env.local` (see `.env.example`). Local Supabase and Mailpit are automatic — see [ENV.md](./ENV.md).

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (automatic locally) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (automatic locally) | Browser + server auth client |
| `NEXT_PUBLIC_SITE_URL` | Recommended for production | Canonical app URL when building redirects outside the browser |
| `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` | No | OAuth buttons on `/login`. Hidden by default; set to `apple,google` (or a subset) when provider credentials are ready. Empty string also hides OAuth. |

`SUPABASE_SERVICE_ROLE_KEY` is **not** used for login. Keep it server-only (E2E reset, scripts).

## Supabase redirect URL configuration

Callback-based flows (OAuth, magic link) only work when `/auth/callback` is on the Supabase Auth allowlist.

### Local development (`npm run dev` on port 3000)

In the [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL configuration**, or in `supabase/config.toml` for the local CLI stack:

| Setting | Value |
|---------|--------|
| **Site URL** | `http://127.0.0.1:3000` (or `http://localhost:3000` — pick one and use it consistently) |
| **Redirect URLs** | `http://127.0.0.1:3000/**` |
| | `http://localhost:3000/**` |
| | `http://127.0.0.1:3100/**` (Playwright E2E) |
| | `http://localhost:3100/**` (Playwright E2E) |

The app sets OAuth `redirectTo`, password sign-up `emailRedirectTo`, and magic-link `emailRedirectTo` to `{origin}/auth/callback?next=…`. The `{origin}` is the **browser’s current host** (not `NEXT_PUBLIC_SITE_URL`), so both `localhost` and `127.0.0.1` variants must be allowlisted if you use either.

### Production

| Setting | Value |
|---------|--------|
| **Site URL** | `https://your-production-domain.com` |
| **Redirect URLs** | `https://your-production-domain.com/auth/callback` |
| | Include staging/preview domains if applicable |

Set `NEXT_PUBLIC_SITE_URL=https://your-production-domain.com` as a fallback when no request/browser origin is available (server-only redirects). Client-side magic-link requests always prefer the live browser origin.

### Hosted Supabase checklist (required for magic-link MVP)

Complete these in **Supabase Dashboard** for the hosted project. Repo changes alone do not update hosted Auth settings.

| Step | Dashboard location | Required setting |
|------|-------------------|------------------|
| 1 | **Authentication → Providers → Email** | **Confirm email** → **ON** (required for password sign-up confirmation). Magic-link sign-in still uses the **Magic Link** template; password sign-up uses the **Confirm signup** template — both must use the PKCE `token_hash` format below. |
| 2 | **Authentication → URL configuration** | Add every callback URL the app uses (localhost, 127.0.0.1, production). |
| 3 | **Authentication → Email Templates** | Update **Magic Link** and **Confirm signup** templates (see below). |
| 4 | Deployment env | Set `NEXT_PUBLIC_SITE_URL` to the production domain. |

Without PKCE-compatible templates, email links route through Supabase verify with a PKCE `code` and fail when opened from email (no verifier cookie).

## Email magic-link template

Supabase sends passwordless sign-in emails through the **Magic Link** template type. Because `@supabase/ssr` uses PKCE, the template must send users **directly to `/auth/callback` with `token_hash` and `type=email`**. The default `{{ .ConfirmationURL }}` alone routes through Supabase’s verify endpoint and redirects with a PKCE `code` that cannot be exchanged when the link is opened from email (no verifier cookie).

The MVP does **not** use `{{ .Token }}` (6-digit codes) in production UI.

The app requests links with:

```typescript
await supabase.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: true,
    emailRedirectTo: getAuthCallbackUrl(origin, nextPath),
  },
});
```

Implemented in `lib/auth/magic-link-auth-client.ts`. The `/films` modal passes `next=/films` so users return to the catalog after clicking the link; pending save/rating actions are stored in a cookie + `localStorage` and applied in `app/auth/callback/route.ts` after the session is established.

### Required Magic Link template (local + hosted)

Subject: **Your sign-in link** (or similar neutral copy)

The app passes `emailRedirectTo` as `{origin}/auth/callback?next=…`. That value must be on the Supabase redirect allowlist (use `http://127.0.0.1:3000/**` locally so query strings are accepted). When allowlisted, `{{ .RedirectTo }}` in the template is the full callback URL and the link appends `token_hash` with `&`. If Supabase falls back to `{{ .SiteURL }}` only, the template below still routes through `/auth/callback?token_hash=…`; the app stores the intended `next` path in a short-lived cookie before sending the link.

```html
<h2>Sign in to Animation Guide</h2>
<p>Click the button below to continue. This link expires shortly and can only be used once.</p>
{{ if eq .RedirectTo .SiteURL }}
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
{{ else }}
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
{{ end }}
<p>If you did not request this email, you can ignore it.</p>
```

Do **not** append `&token_hash=…` directly to the bare site root (`http://127.0.0.1:3000&token_hash=…`) — that skips `/auth/callback` and breaks sign-in. The callback route calls `verifyOtp({ token_hash, type: 'email' })` server-side and sets session cookies before redirecting to `next`.

### Where templates are managed

| Environment | Managed via | Notes |
|-------------|-------------|-------|
| **Local Supabase CLI** (`supabase start`) | Repo files | `supabase/config.toml` → `[auth.email.template.magic_link]` points at `supabase/templates/email-magic-link.html`. Restart the local Auth stack after template changes (`supabase stop && supabase start`). |
| **Hosted Supabase (production / staging)** | **Supabase Dashboard only** | **Authentication → Email Templates → Magic Link**. Paste the PKCE-compatible template above. Also disable **Confirm email** under **Providers → Email**. Dashboard edits are **not** synced from this repo automatically. |

There is no deploy step that pushes email templates from this repo to a hosted Supabase project. Treat `supabase/templates/email-magic-link.html` as the local source of truth.

### Local CLI configuration (already in repo)

```toml
[auth.email.template.magic_link]
subject = "Your sign-in link"
content_path = "./supabase/templates/email-magic-link.html"
```

Template file: `supabase/templates/email-magic-link.html`

Link expiry is configured under `[auth.email]` (`otp_expiry = 3600`).

### Hosted dashboard (MVP)

1. **Disable Confirm email** under **Authentication → Providers → Email** so new and existing users share one magic-link flow via `signInWithOtp`.
2. Paste the PKCE-compatible Magic Link template above into **Authentication → Email Templates → Magic Link**.
3. Allowlist callback URLs with wildcards under **Authentication → URL configuration** (for example `https://your-production-domain.com/**`).

Copy is intentionally neutral — it does not say whether the email already has an account.

### Product UI after sending a link

Both `/login` and the `/films` auth modal show:

1. Email step → **Send sign-in link**
2. Confirmation step → **Check your inbox** with resend cooldown and **Change email**

There is no OTP input in the production UI.

## Local magic-link testing (Mailpit)

The Supabase CLI captures **all local Auth emails in Mailpit**. Nothing is delivered externally during local development or local-stack E2E runs. Use any synthetic address (`magic-link-test-1@example.com`, `new-user@example.test`, etc.).

### Start the local stack

From the repo root:

```bash
supabase start
```

If you changed `supabase/config.toml` (templates, ports, auth limits), restart:

```bash
supabase stop && supabase start
```

### Look up Mailpit and Supabase URLs

Human-readable:

```bash
supabase status
```

Look for **Mailpit URL** (default `http://127.0.0.1:54324`).

Machine-readable env vars from `supabase status -o env` (for updating `.env.development` if JWT secrets change):

```bash
supabase status -o env
```

Relevant keys:

| Variable | Purpose |
|----------|---------|
| `API_URL` | Set as `NEXT_PUBLIC_SUPABASE_URL` |
| `ANON_KEY` | Set as `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SERVICE_ROLE_KEY` | Set as `SUPABASE_SERVICE_ROLE_KEY` (server/E2E only) |
| `MAILPIT_URL` | Mailpit web UI + API (override with env in E2E helpers) |

Open Mailpit in a browser to read magic-link emails manually, or use the API (`/api/v1/search`, `/api/v1/message/{ID}`).

### Point the app at local Supabase

Local values are in committed `.env.development` and applied automatically by `npm run dev` (see [ENV.md](./ENV.md)). After `supabase start`:

```bash
npm run dev
```

Request a sign-in link on `/films` or `/login`, then open Mailpit and click the confirmation URL from the captured email.

### Configuration notes

| Topic | Detail |
|-------|--------|
| **Config file key** | `[inbucket]` in `supabase/config.toml` — legacy name; the CLI runs **Mailpit** on `port = 54324`. |
| **SMTP block** | Leave `[auth.email.smtp]` commented out locally. Mailpit capture is automatic. |
| **Production** | Configure real SMTP in the hosted Supabase Dashboard. Do not point production at Mailpit. |
| **Templates** | Local: `supabase/templates/email-magic-link.html` (magic link) and `supabase/templates/email-confirmation.html` (password sign-up). |

See [TESTING.md](./TESTING.md) for E2E retrieval of magic links through Mailpit’s API.

### E2E (port 3100)

Playwright runs `next start` on port **3100**. If you test callback flows against that server, also allow:

- `http://127.0.0.1:3100/auth/callback`
- `http://localhost:3100/auth/callback`

## Password sign-in / sign-up

Password sign-up (`signUp` on `/login`) sends **one** confirmation email when **Confirm email** is enabled. The link confirms the address and establishes a session via `/auth/callback` — no second email and no separate login step.

The app passes:

```typescript
await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: getAuthCallbackUrl(origin), // → /auth/callback?next=/my-profile
  },
});
```

### Signup confirmation email template (PKCE)

Like magic links, `@supabase/ssr` requires the **Confirm signup** template to send users directly to `/auth/callback` with `token_hash` and `type=signup` (not `{{ .ConfirmationURL }}` alone).

Local template: `supabase/templates/email-confirmation.html` via `[auth.email.template.confirmation]`.

Hosted: **Authentication → Email Templates → Confirm signup** — paste the same pattern as the magic-link template, with `type=signup`:

```html
<h2>Confirm your email address</h2>
<p>Click the button below to confirm your email and sign in. This link expires shortly and can only be used once.</p>
{{ if eq .RedirectTo .SiteURL }}
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirm email address</a></p>
{{ else }}
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup">Confirm email address</a></p>
{{ end }}
<p>If you did not create an account, you can ignore this email.</p>
```

The callback route calls `verifyOtp({ token_hash, type: 'signup' })`, sets session cookies, and redirects to `next` (default `/my-profile`).

### Supabase Dashboard

**Authentication → Providers → Email**

- Enable Email provider (on by default).
- **Confirm email**: should be **ON** for production password sign-up. Local CLI sets `enable_confirmations = true` in `supabase/config.toml` so Mailpit captures the same single confirmation email.
- **Minimum password length**: defaults to 6 characters (matches the login form).

No extra app env vars are required beyond the standard Supabase URL and anon key.

### Local CLI (`supabase/config.toml`)

Email signup is enabled under `[auth]`. Password rules follow `[auth]` / provider settings in the config file.

## OAuth (Apple, Google)

OAuth buttons are **hidden by default**. Set `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=apple,google` (or a subset) once provider credentials are configured in Supabase and Apple/Google developer consoles. The app-side `signInWithOAuth` flow and shared `/auth/callback` handler remain in place.

### App-side flow (already implemented)

1. User clicks **Continue with Apple** or **Continue with Google**.
2. Browser calls `signInWithOAuth({ provider, options: { redirectTo: '{origin}/auth/callback' } })`.
3. User authenticates with the provider.
4. Provider redirects to `/auth/callback?code=...`.
5. Shared callback route exchanges the code for a session.

### Supabase Dashboard (both providers)

1. **Authentication → URL configuration** — ensure `/auth/callback` redirect URLs are allowlisted (see above).
2. **Authentication → Providers** — enable Apple and/or Google.
3. Enter the **Client ID** and **Client Secret** from the provider console.
4. Note the **Callback URL** shown in the Supabase provider settings (format: `https://<project-ref>.supabase.co/auth/v1/callback`). Register this exact URL in the provider console.

Set in `.env.local` / deployment env when OAuth is ready:

```bash
NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=apple,google
```

### Apple Sign In — provider-side setup (cannot be completed in app code alone)

Required in [Apple Developer](https://developer.apple.com/account):

1. **App ID** with Sign In with Apple capability.
2. **Services ID** (this becomes the Supabase **Client ID**).
3. **Key** (.p8) for Sign In with Apple — used to generate the client secret for Supabase.
4. Configure the Services ID **Return URL** to the Supabase callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`

In Supabase → **Authentication → Providers → Apple**:

- **Client ID**: Apple Services ID (e.g. `com.example.app.web`)
- **Client Secret**: JWT generated from the Apple key (Supabase docs describe generation; secret expires and must be rotated)

For local Supabase CLI, set in `supabase/config.toml`:

```toml
[auth.external.apple]
enabled = true
client_id = "com.example.app.web"
secret = "env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)"
```

And provide `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` in your local env (never commit).

Apple may return a private relay email; the app displays it via `getUserDisplayEmail`.

### Google Sign In — provider-side setup

Required in [Google Cloud Console](https://console.cloud.google.com/):

1. Create an OAuth 2.0 **Web application** client.
2. **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Copy **Client ID** and **Client Secret** into Supabase → **Authentication → Providers → Google**.

For local Google sign-in with the Supabase CLI, you may need `skip_nonce_check = true` under `[auth.external.google]` in `config.toml` (see Supabase local-dev docs).

## Troubleshooting magic-link failures

If sign-in fails after clicking the email link, check browser network errors on `/auth/callback`.

Common causes:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| New email gets **“Confirm your email address”** after **password sign-up** but session is not established | Default **Confirm signup** template uses `{{ .ConfirmationURL }}` with PKCE client | Paste the PKCE **Confirm signup** template from the Password sign-in / sign-up section above. |
| Magic-link email works but password sign-up confirmation does not | Only Magic Link template updated | Update **both** Magic Link and Confirm signup templates on hosted Supabase. |
| Link opens but session is not established | Default Magic Link template uses `{{ .ConfirmationURL }}` with PKCE client; email opens without PKCE verifier cookie | Use the PKCE template with `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (see above). |
| Link opens but session is not established | `/auth/callback` not on Supabase redirect allowlist, or host mismatch (127.0.0.1 vs localhost) | Add the exact callback URL to **Authentication → URL configuration**. Use one host consistently, or allowlist both. |
| `pkce_code_verifier_not_found` on callback | Same as above — PKCE code exchange without verifier | Update Magic Link template to token_hash flow; restart not required on hosted. |
| Email contains a **6-digit code** instead of a link | Hosted template exposes `{{ .Token }}` only | Use Magic Link template with `token_hash` link as above. |
| `over_email_send_rate_limit` | Too many resend requests | Wait for the cooldown (app enforces 30s client-side; Supabase also rate-limits). |
| `validation_failed` | Malformed email | Enter a valid email address. |
| Pending save/rating not applied after sign-in | Pending action cookie cleared before profile link exists | Callback applies pending actions server-side when profile exists; client retries on `SIGNED_IN`. |

The `/auth/callback` route handles magic links (`verifyOtp` with `token_hash`), OAuth (`exchangeCodeForSession`), and legacy email confirmation.

## Profile linking and identity resolution

The app does **not** link profiles by email address. It resolves guides only through `profiles.user_id = auth.users.id` (see `lib/auth/session.ts`, `app/my-profile/page.tsx`). Share-token access (`/p/{slug}?token=...`) is separate and does not use auth.

### What the app does after sign-in

| Step | Behavior |
|------|----------|
| Session | Supabase Auth session cookie (any method) |
| Profile provisioning | `/auth/callback` calls `ensureAuthProfileForUser` after successful `verifyOtp` or `exchangeCodeForSession` — idempotent, one guide per `auth.users.id` |
| Profile lookup | `SELECT ... FROM profiles WHERE user_id = <auth.users.id>` |
| Header | No global nav bar; guide pages show a compact account menu beside the title |
| `/` (signed in + linked profile) | Redirects to `/my-profile` |
| `/` (signed out, or signed in without linked profile) | Public home page |
| `/my-profile` | Redirects to guide if linked; otherwise empty state |

Hosted and local environments still support manual `profiles.user_id` linking for legacy data, but new sign-ups receive a personal guide automatically during auth callback completion.

### Supabase Auth: when different sign-in methods share one user

Supabase [automatic identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking) merges sign-ins that share the **same verified email** into one `auth.users` row. That is what makes multiple methods converge on one `profiles.user_id` link.

| First sign-in | Later sign-in (same person) | Same `auth.users.id`? | Notes |
|---------------|----------------------------|------------------------|-------|
| Email magic link | Password (same email) | **Yes** | Both use the email identity |
| Password sign-up | Email magic link (same email) | **Yes** | Signs into the existing email user |
| Email magic link / password | Google (same verified email) | **Yes** | OAuth identity auto-linked |
| Email magic link / password | Apple (same verified email) | **Yes** | OAuth identity auto-linked |
| Google | Apple (same verified email) | **Yes** | OAuth ↔ OAuth auto-linked |
| Google | Email magic link (same email) | **Yes** | Magic link targets linked user |

Requirements for automatic linking:

- Emails must **match exactly** (case-normalized by Supabase).
- The existing account email must be **verified** before OAuth can link to it.
- Unverified duplicate identities may be removed by Supabase during linking.

### When Supabase may create a separate auth user (split-account risk)

| Scenario | Same `auth.users.id`? | Impact on linked profile |
|----------|------------------------|---------------------------|
| Apple **Hide My Email** (`@privaterelay.appleid.com`) vs real email used for magic link / Google | **No** | `profiles.user_id` stays on the first user; Apple relay sign-in shows **no profile linked** |
| OAuth / email use **different email addresses** | **No** | Separate users; only the linked UUID sees the guide |
| User clicks **Create account** with a new email while an existing auth user already owns the guide email | **No** (new user) | New auth row; profile remains on old `user_id` |
| Second email sign-up after OAuth with same email via **Create account** | N/A (blocked) | Supabase returns an obfuscated response; no second user (anti-enumeration) |

The highest practical risk before inviting real users is **Apple Hide My Email**: it produces a stable but different email, so Supabase treats it as a different person.

Password added to an OAuth-only account via `updateUser({ password })` can work for sign-in, but the email provider may not appear in `auth.identities` (known Supabase quirk). Session and `auth.users.id` still remain the same user.

### Smallest safe mitigation before inviting real users

**1. Database guard (included in repo)**

Migration `supabase/migrations/20250619_profiles_user_id_unique.sql` adds a unique partial index so one auth user cannot be linked to two profiles:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx
  ON public.profiles (user_id)
  WHERE user_id IS NOT NULL;
```

Apply on hosted Supabase via `supabase db push` or SQL Editor.

**2. Operational linking procedure (required today)**

For each real user:

1. Ask them to sign in once with the method and email they plan to use going forward.
2. In **Supabase Dashboard → Authentication → Users**, copy that user’s **UUID** and confirm the email shown.
3. Set `profiles.user_id` to that UUID (see `supabase/queries/profile-auth-linking.sql`).
4. Have them sign out and back in (any linked method with the **same email**) → account menu should show their profile name; `/my-profile` should open their guide.

Do **not** set `profiles.user_id` from email alone — always use the UUID after a real sign-in.

**3. User guidance (reduces split-account risk)**

- Use the **same email** for magic link, password, Google, and Apple when possible.
- For Apple: prefer sharing the real email, or standardize on the private relay address and use that consistently (including when linking).
- For the first invited users, consider starting with **one** method (magic link or Google) until `profiles.user_id` is set, then add other methods.

**4. Not in scope yet (defer)**

- In-app `linkIdentity()` UI for users who already have split accounts
- Email-based profile matching in app code
- RLS or admin merge tools

If a user already has two auth rows, fix in Supabase Dashboard (delete/merge the stray user) or re-link `profiles.user_id` to the canonical UUID after they sign in with the intended account.

### Verifying linked methods manually

After `profiles.user_id` is set:

1. Sign in with method A → profile name appears.
2. Sign out → sign in with method B (same email) → same profile name.
3. In SQL Editor, run the identities query in `supabase/queries/profile-auth-linking.sql` → multiple providers on one `user_id`.

Cannot be fully automated in CI without real Google/Apple credentials and per-user Supabase state.

## Manual verification

1. Start the app: `npm run dev`
2. **Magic link**: `/login` or `/films` → enter email → open the confirmation link from Mailpit (`supabase status` → Mailpit URL)
3. **Password**: create account or sign in with email + password
4. **OAuth** (after provider + `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` configured): click provider button → complete provider login
5. Open the account menu (initials button beside the guide title) → confirm profile name and email
6. Click **Log out** → **Log in** link appears on pages that show account controls
7. Confirm `/p/{slug}?token=...` still works without signing in

## Automated tests

| Layer | Coverage |
|-------|----------|
| **Unit** | `lib/auth/callback-url.test.mjs`, `lib/auth/callback-params.test.mjs`, `lib/auth/callback-error.test.mjs`, `lib/auth/magic-link-auth.test.mjs`, `lib/auth/extract-magic-link-from-email.test.mjs`, `lib/auth/oauth-providers.test.mjs`, `lib/auth/user-display.test.mjs` |
| **E2E** | `e2e/smoke/auth.spec.ts`, `e2e/smoke/films-auth.spec.ts`, `e2e/smoke/films-pending-action.spec.ts` — login UI + real Mailpit magic-link verification against local Supabase |

**Not automated** (requires real email delivery or provider credentials):

- Magic-link sign-in against hosted Supabase without Mailpit
- Password sign-in against a real Supabase user
- OAuth redirects with Apple/Google credentials

Configure providers and run the manual steps above to verify those flows.
