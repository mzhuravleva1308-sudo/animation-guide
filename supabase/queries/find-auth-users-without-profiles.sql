SELECT
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at
FROM auth.users AS u
LEFT JOIN public.profiles AS p
  ON p.user_id = u.id
WHERE p.id IS NULL
  AND u.deleted_at IS NULL;
