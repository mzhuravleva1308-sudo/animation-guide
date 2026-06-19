# Authentication (Supabase)

Sign-in via Supabase Auth: magic link, email/password, and optional OAuth (Apple, Google). No route protection, RLS, or admin roles in this layer.

## Supported methods

| Method | Client API | Session path |
|--------|------------|--------------|
| Magic link | `signInWithOtp` | Email link → `/auth/callback?token_hash=...&type=magiclink` → `verifyOtp` |
| Password sign-in | `signInWithPassword` | Immediate browser session |
| Password sign-up | `signUp` | Immediate session, or email confirmation → `/auth/callback` |
| OAuth (Apple, Google) | `signInWithOAuth` | Provider → `/auth/callback?code=...` |

All callback-based flows share `app/auth/callback/route.ts`. Magic links use `verifyOtp({ token_hash, type })`, which works across browsers/devices. OAuth and legacy PKCE email links still use `exchangeCodeForSession(code)`. Password sign-in creates the session directly in the browser.

After any successful sign-in, the account menu resolves the linked profile via `profiles.user_id`. Users without a linked profile still see their email in the menu.

Logout is always `POST /auth/logout` regardless of how the user signed in.

Unauthenticated browsing (home, `/films`, share-link profiles) is unchanged. Signed-in users with a linked profile are redirected from `/` to `/my-profile`, which opens their guide when `slug` and `share_token` are present.

After any successful sign-in (password, magic link, OAuth), the default destination is `/my-profile` — not the public home page. Callback-based flows pass `next=/my-profile` on `/auth/callback`; password sign-in navigates there directly.

## Environment variables

Add to `.env.local` (see `.env.example`):

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser + server auth client |
| `NEXT_PUBLIC_SITE_URL` | Recommended for production | Canonical app URL when building redirects outside the browser |
| `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` | No | OAuth buttons on `/login`. Hidden by default; set to `apple,google` (or a subset) when provider credentials are ready. Empty string also hides OAuth. |

`SUPABASE_SERVICE_ROLE_KEY` is **not** used for login. Keep it server-only (E2E reset, scripts).

## Supabase redirect URL configuration

Callback-based flows (magic link, OAuth, email confirmation) only work when `/auth/callback` is on the Supabase Auth allowlist.

### Local development (`npm run dev` on port 3000)

In the [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL configuration**, or in `supabase/config.toml` for the local CLI stack:

| Setting | Value |
|---------|--------|
| **Site URL** | `http://127.0.0.1:3000` (or `http://localhost:3000` — pick one and use it consistently) |
| **Redirect URLs** | `http://127.0.0.1:3000/auth/callback` |
| | `http://localhost:3000/auth/callback` |
| | `https://127.0.0.1:3000/auth/callback` (if using HTTPS locally) |

The app sets `emailRedirectTo` / OAuth `redirectTo` to `{origin}/auth/callback`, so the host in the email or provider redirect must match an allowed URL.

### Production

| Setting | Value |
|---------|--------|
| **Site URL** | `https://your-production-domain.com` |
| **Redirect URLs** | `https://your-production-domain.com/auth/callback` |

Set `NEXT_PUBLIC_SITE_URL=https://your-production-domain.com` if you add server-side redirects that need a fixed origin.

## Magic link email template (required for cross-browser sign-in)

The default Supabase magic-link email uses `{{ .ConfirmationURL }}`, which routes through Supabase Auth with a PKCE `code`. That code only works in the browser that requested the link.

To let users open the email link in any browser or device, customize the **Magic link** template so it points directly at your app callback with `token_hash` and `type=magiclink`. The app verifies the hash server-side via `verifyOtp`.

### Hosted Supabase project

In **Authentication → Email Templates → Magic link**, replace the sign-in link with:

```html
<h2>Your sign-in link</h2>
<p>Follow the link below to sign in. This link expires shortly and can only be used once.</p>
<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink">Sign in</a>
</p>
```

`{{ .RedirectTo }}` comes from the app’s `emailRedirectTo` option (`{origin}/auth/callback`). Ensure that URL is allowlisted under **Authentication → URL configuration → Redirect URLs**.

### Local Supabase CLI

This repo already configures the template in `supabase/config.toml`:

```toml
[auth.email.template.magic_link]
subject = "Your sign-in link"
content_path = "./supabase/templates/magic-link.html"
```

Template file: `supabase/templates/magic-link.html`

After changing templates locally, restart the Supabase stack so Auth picks up the file.

### Resulting callback URL shape

```text
https://your-app.example/auth/callback?token_hash=<hash>&type=magiclink
```

No PKCE verifier cookie is required. The latest unused link wins; older links expire per Supabase Auth settings.

### E2E (port 3100)

Playwright runs `next start` on port **3100**. If you test callback flows against that server, also allow:

- `http://127.0.0.1:3100/auth/callback`
- `http://localhost:3100/auth/callback`

## Password sign-in / sign-up

### Supabase Dashboard

**Authentication → Providers → Email**

- Enable Email provider (on by default).
- **Confirm email**: if enabled, new sign-ups must confirm via email before signing in. The confirmation link also uses `/auth/callback`.
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

## Troubleshooting magic-link callback failures

If `/login` shows **Could not sign you in** after opening a magic link, check server logs for `[auth/callback] authentication failed`. The log includes:

- `errorCode` — Supabase Auth error (e.g. `otp_expired`)
- `method` — `verify_otp` (token_hash flow) or `exchange_code` (legacy PKCE)
- `callbackHost` — host that received the callback

Common causes:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `missing_callback_params` | Email still uses default `{{ .ConfirmationURL }}` but app expects token_hash, or link was truncated | Update the **Magic link** email template (see above). Request a new link after saving the template. |
| `otp_expired` / `flow_state_expired` | Link is old or already used | Request a new magic link. Each link is single-use. |
| `pkce_code_verifier_not_found` | Legacy PKCE-only email opened in a different browser | Update the email template to the `token_hash` version above. |
| `validation_failed` / `invalid_grant` | Redirect URL not allowlisted or malformed callback | Confirm `/auth/callback` is in Supabase **Redirect URLs** for the exact host you use. |

The callback route binds session cookies directly to the redirect response. The proxy skips `/auth/callback` so it does not interfere with verification.

## Profile linking and identity resolution

The app does **not** link profiles by email address. It resolves guides only through `profiles.user_id = auth.users.id` (see `lib/auth/session.ts`, `app/my-profile/page.tsx`). Share-token access (`/p/{slug}?token=...`) is separate and does not use auth.

### What the app does after sign-in

| Step | Behavior |
|------|----------|
| Session | Supabase Auth session cookie (any method) |
| Profile lookup | `SELECT ... FROM profiles WHERE user_id = <auth.users.id>` |
| Header | No global nav bar; guide pages show a compact account menu beside the title |
| `/` (signed in + linked profile) | Redirects to `/my-profile` |
| `/` (signed out, or signed in without linked profile) | Public home page |
| `/my-profile` | Redirects to guide if linked; otherwise empty state |

Setting `profiles.user_id` is a **manual, out-of-band** step today (SQL or Supabase dashboard). The app never writes `user_id` during login.

### Supabase Auth: when different sign-in methods share one user

Supabase [automatic identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking) merges sign-ins that share the **same verified email** into one `auth.users` row. That is what makes multiple methods converge on one `profiles.user_id` link.

| First sign-in | Later sign-in (same person) | Same `auth.users.id`? | Notes |
|---------------|----------------------------|------------------------|-------|
| Magic link | Password (same email) | **Yes** | Both use the email identity |
| Password sign-up | Magic link (same email) | **Yes** | Signs into the existing email user |
| Magic link / password | Google (same verified email) | **Yes** | OAuth identity auto-linked |
| Magic link / password | Apple (same verified email) | **Yes** | OAuth identity auto-linked |
| Google | Apple (same verified email) | **Yes** | OAuth ↔ OAuth auto-linked |
| Google | Magic link (same email) | **Yes** | Email OTP targets linked user |

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
2. **Magic link**: `/login` → email → open link from email (or Inbucket locally)
3. **Password**: create account or sign in with email + password
4. **OAuth** (after provider + `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` configured): click provider button → complete provider login
5. Open the account menu (initials button beside the guide title) → confirm profile name and email
6. Click **Log out** → **Log in** link appears on pages that show account controls
7. Confirm `/p/{slug}?token=...` still works without signing in

## Automated tests

| Layer | Coverage |
|-------|----------|
| **Unit** | `lib/auth/callback-url.test.mjs`, `lib/auth/callback-params.test.mjs`, `lib/auth/callback-error.test.mjs`, `lib/auth/oauth-providers.test.mjs`, `lib/auth/user-display.test.mjs` |
| **E2E** | `e2e/smoke/auth.spec.ts` — unified login page + signed-out account control on home |

**Not automated** (requires real email or provider credentials):

- Magic-link email delivery
- Password sign-in against a real Supabase user
- OAuth redirects with Apple/Google credentials

Configure providers and run the manual steps above to verify those flows.
