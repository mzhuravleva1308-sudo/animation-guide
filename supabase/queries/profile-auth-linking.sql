-- Admin helpers for linking profiles.user_id to auth.users.id
-- Run in Supabase SQL Editor (requires appropriate access to auth schema).

-- 1) Inspect a profile and its linked auth user (if any)
-- Replace the slug as needed.
SELECT
  p.id AS profile_id,
  p.name,
  p.slug,
  p.user_id,
  u.email AS auth_email,
  u.created_at AS auth_user_created_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE p.slug = 'maria';

-- 2) List linked identities for an auth user
-- Replace the UUID after the user signs in once.
SELECT
  i.provider,
  i.identity_data->>'email' AS identity_email,
  i.created_at,
  i.last_sign_in_at
FROM auth.identities i
WHERE i.user_id = '00000000-0000-0000-0000-000000000000'
ORDER BY i.created_at;

-- 3) Link a profile to the canonical auth user (manual, one-time)
-- Only run after verifying the UUID from Authentication → Users.
-- UPDATE public.profiles
-- SET user_id = '00000000-0000-0000-0000-000000000000'
-- WHERE slug = 'maria'
--   AND user_id IS NULL;
