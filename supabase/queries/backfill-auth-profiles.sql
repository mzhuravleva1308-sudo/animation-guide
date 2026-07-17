-- Review candidates with find-auth-users-without-profiles.sql before running this.
-- This is intentionally a standalone, manually-run backfill, not a migration.
DO $$
DECLARE
  auth_user record;
  slug_base text;
  slug_candidate text;
  attempt integer;
  inserted_rows integer;
BEGIN
  FOR auth_user IN
    SELECT u.id, u.email
    FROM auth.users AS u
    LEFT JOIN public.profiles AS p
      ON p.user_id = u.id
    WHERE p.id IS NULL
      AND u.deleted_at IS NULL
    ORDER BY u.created_at, u.id
  LOOP
    slug_base := regexp_replace(
      left(
        regexp_replace(
          regexp_replace(
            coalesce(
              nullif(split_part(lower(trim(auth_user.email)), '@', 1), ''),
              'guide'
            ),
            '[^a-z0-9]+',
            '-',
            'g'
          ),
          '(^-+|-+$)',
          '',
          'g'
        ),
        40
      ),
      '(^-+|-+$)',
      '',
      'g'
    );

    IF slug_base = '' THEN
      slug_base := 'guide';
    END IF;

    slug_base := slug_base || '-' || left(replace(auth_user.id::text, '-', ''), 8);

    FOR attempt IN 0..100 LOOP
      slug_candidate := CASE
        WHEN attempt = 0 THEN slug_base
        ELSE slug_base || '-' || (attempt + 1)::text
      END;

      BEGIN
        INSERT INTO public.profiles (user_id, slug, share_token)
        VALUES (auth_user.id, slug_candidate, gen_random_uuid())
        ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;

        GET DIAGNOSTICS inserted_rows = ROW_COUNT;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          -- A slug collision is retried with the same suffix strategy as the app.
          NULL;
      END;
    END LOOP;
  END LOOP;
END
$$;
