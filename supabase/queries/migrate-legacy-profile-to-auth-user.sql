-- =============================================================================
-- ONE-TIME ADMIN: link legacy share-token profiles to auth.users
-- =============================================================================
-- DO NOT run as a tracked migration. Run manually in Supabase SQL Editor
-- (or psql as postgres / service role) after filling parameters.
--
-- Goal per user:
--   * keep legacy profiles.id (and all child data)
--   * set legacy.user_id = auth.users.id
--   * delete the empty auth-provisioned profile
--   * rotate share_token so old share links lose write access
--
-- Auth provisioning context (app):
--   ensureAuthProfileForUser inserts a new profiles row on first login/callback
--   with user_id, slug, share_token (and nullable name). Pending film actions
--   applied during auth/callback can leave ratings/lists on that new profile —
--   never delete without the emptiness checks below.
--
-- Schema facts (from migrations):
--   1) UNIQUE on user_id: partial unique index profiles_user_id_unique_idx
--      ON profiles (user_id) WHERE user_id IS NOT NULL
--      (migration 20250619_profiles_user_id_unique.sql)
--   2) Child tables referencing profiles.id (all ON DELETE CASCADE):
--        film_ratings
--        profile_film_lists
--        profile_taste_cores
--        profile_film_scores
--        profile_activity_logs
--        top_picks
--        profile_score_rebuild_jobs
--   3) profiles.user_id → auth.users(id) ON DELETE SET NULL
--   4) share_token is NOT NULL; default gen_random_uuid(); no UNIQUE index
--   5) Order constraint: cannot UPDATE legacy.user_id while empty profile still
--      holds the same user_id (unique violation). Delete (or NULL) empty first.
--   6) Setting empty.user_id = NULL before DELETE is optional; DELETE alone frees
--      the unique index. Prefer DELETE-then-UPDATE inside one transaction.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0) PARAMETERS — fill these before any mutating statement
-- -----------------------------------------------------------------------------
-- Per user you need:
--   :legacy_slug_or_id   — legacy profile slug OR id
--   :auth_email_or_id    — auth.users email OR id
--   :empty_profile_id    — the auto-provisioned empty profile id
--
-- Also record for rollback (from pre-check SELECT):
--   legacy_id, legacy_share_token_before, empty_slug, empty_share_token


-- =============================================================================
-- 1) READ-ONLY: resolve identities and inspect state (one user)
-- =============================================================================
-- Replace the three literals below.

WITH params AS (
  SELECT
    'LEGACY_SLUG_OR_UUID'::text AS legacy_ref,          -- slug or profiles.id::text
    'user@example.com'::text AS auth_ref,               -- email or auth.users.id::text
    '00000000-0000-0000-0000-000000000000'::uuid AS empty_profile_id
),
legacy AS (
  SELECT p.*
  FROM public.profiles p, params
  WHERE p.slug = params.legacy_ref
     OR p.id::text = params.legacy_ref
),
auth_user AS (
  SELECT u.id, u.email, u.created_at, u.deleted_at
  FROM auth.users u, params
  WHERE u.email = lower(trim(params.auth_ref))
     OR u.id::text = params.auth_ref
),
empty_profile AS (
  SELECT p.*
  FROM public.profiles p, params
  WHERE p.id = params.empty_profile_id
)
SELECT
  'legacy' AS role,
  l.id,
  l.slug,
  l.name,
  l.user_id,
  l.share_token,
  l.taste_profile IS NOT NULL AS has_taste_profile_text,
  l.taste_profile_updated_at,
  l.created_at
FROM legacy l
UNION ALL
SELECT
  'empty',
  e.id,
  e.slug,
  e.name,
  e.user_id,
  e.share_token,
  e.taste_profile IS NOT NULL,
  e.taste_profile_updated_at,
  e.created_at
FROM empty_profile e;

-- Auth user row
WITH params AS (
  SELECT 'user@example.com'::text AS auth_ref
)
SELECT u.id, u.email, u.created_at, u.deleted_at, u.email_confirmed_at
FROM auth.users u, params
WHERE u.email = lower(trim(params.auth_ref))
   OR u.id::text = params.auth_ref;

-- How many profiles currently claim this auth user_id?
WITH params AS (
  SELECT 'user@example.com'::text AS auth_ref
),
auth_user AS (
  SELECT u.id
  FROM auth.users u, params
  WHERE u.email = lower(trim(params.auth_ref))
     OR u.id::text = params.auth_ref
)
SELECT p.id, p.slug, p.user_id, p.created_at
FROM public.profiles p
JOIN auth_user a ON a.id = p.user_id;


-- =============================================================================
-- 2) READ-ONLY: prove empty profile is empty (ABORT if any count > 0
--    or taste_profile text is set)
-- =============================================================================
-- Replace empty_profile_id.

WITH params AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS empty_profile_id
),
counts AS (
  SELECT
    (SELECT count(*) FROM public.film_ratings r, params WHERE r.profile_id = params.empty_profile_id) AS ratings,
    (SELECT count(*) FROM public.profile_film_lists l, params WHERE l.profile_id = params.empty_profile_id) AS lists,
    (SELECT count(*) FROM public.profile_film_lists l, params
      WHERE l.profile_id = params.empty_profile_id AND l.list_type = 'to_watch') AS saved_to_watch,
    (SELECT count(*) FROM public.profile_taste_cores t, params WHERE t.profile_id = params.empty_profile_id) AS taste_cores,
    (SELECT count(*) FROM public.profile_film_scores s, params WHERE s.profile_id = params.empty_profile_id) AS film_scores,
    (SELECT count(*) FROM public.profile_score_rebuild_jobs j, params WHERE j.profile_id = params.empty_profile_id) AS score_jobs,
    (SELECT count(*) FROM public.profile_activity_logs a, params WHERE a.profile_id = params.empty_profile_id) AS activity_logs,
    (SELECT count(*) FROM public.top_picks tp, params WHERE tp.profile_id = params.empty_profile_id) AS top_picks,
    (SELECT p.taste_profile IS NOT NULL FROM public.profiles p, params WHERE p.id = params.empty_profile_id) AS has_taste_profile_text,
    (SELECT p.taste_profile_updated_at IS NOT NULL FROM public.profiles p, params WHERE p.id = params.empty_profile_id) AS has_taste_profile_updated_at
)
SELECT
  *,
  (
    ratings = 0
    AND lists = 0
    AND taste_cores = 0
    AND film_scores = 0
    AND score_jobs = 0
    AND activity_logs = 0
    AND top_picks = 0
    AND has_taste_profile_text IS DISTINCT FROM true
    AND has_taste_profile_updated_at IS DISTINCT FROM true
  ) AS is_safe_to_delete
FROM counts;

-- Optional detail if not empty (inspect before aborting):
-- SELECT 'film_ratings' AS src, id::text, film_id::text, NULL::text FROM film_ratings WHERE profile_id = '...'
-- UNION ALL SELECT 'profile_film_lists', id::text, film_id::text, list_type FROM profile_film_lists WHERE profile_id = '...'
-- ...


-- =============================================================================
-- 2b) READ-ONLY: legacy should KEEP its data (sanity, not emptiness)
-- =============================================================================
WITH params AS (
  SELECT 'LEGACY_SLUG_OR_UUID'::text AS legacy_ref
),
legacy AS (
  SELECT p.id
  FROM public.profiles p, params
  WHERE p.slug = params.legacy_ref OR p.id::text = params.legacy_ref
)
SELECT
  (SELECT count(*) FROM public.film_ratings r JOIN legacy l ON r.profile_id = l.id) AS ratings,
  (SELECT count(*) FROM public.profile_film_lists x JOIN legacy l ON x.profile_id = l.id) AS lists,
  (SELECT count(*) FROM public.profile_taste_cores t JOIN legacy l ON t.profile_id = l.id) AS taste_cores,
  (SELECT count(*) FROM public.profile_film_scores s JOIN legacy l ON s.profile_id = l.id) AS film_scores;


-- =============================================================================
-- 3) TRANSACTION: migrate ONE user
-- =============================================================================
-- Preconditions (enforced by RAISE):
--   * legacy and empty profiles exist and are distinct
--   * empty.user_id = auth user id
--   * legacy.user_id IS NULL (or already equals auth user — no-op link)
--   * empty profile has zero child rows and no taste_profile text
--   * auth user exists and is not deleted
--
-- If empty profile is NOT empty: DO NOT RUN. Manually merge/decide first.
--
-- Replace the three literals in params.

BEGIN;

DO $$
DECLARE
  v_legacy_ref text := 'LEGACY_SLUG_OR_UUID';
  v_auth_ref text := 'user@example.com';
  v_empty_id uuid := '00000000-0000-0000-0000-000000000000';

  v_auth_id uuid;
  v_legacy_id uuid;
  v_legacy_user_id uuid;
  v_legacy_share_token text;
  v_empty_user_id uuid;
  v_new_share_token text;

  v_ratings bigint;
  v_lists bigint;
  v_cores bigint;
  v_scores bigint;
  v_jobs bigint;
  v_activity bigint;
  v_picks bigint;
  v_has_taste boolean;
BEGIN
  SELECT u.id INTO v_auth_id
  FROM auth.users u
  WHERE (u.email = lower(trim(v_auth_ref)) OR u.id::text = v_auth_ref)
    AND u.deleted_at IS NULL;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'auth user not found or deleted for ref=%', v_auth_ref;
  END IF;

  SELECT p.id, p.user_id, p.share_token
  INTO v_legacy_id, v_legacy_user_id, v_legacy_share_token
  FROM public.profiles p
  WHERE p.slug = v_legacy_ref OR p.id::text = v_legacy_ref;

  IF v_legacy_id IS NULL THEN
    RAISE EXCEPTION 'legacy profile not found for ref=%', v_legacy_ref;
  END IF;

  IF v_legacy_id = v_empty_id THEN
    RAISE EXCEPTION 'legacy and empty profile ids must differ';
  END IF;

  IF v_legacy_user_id IS NOT NULL AND v_legacy_user_id <> v_auth_id THEN
    RAISE EXCEPTION 'legacy profile already linked to different user_id=%', v_legacy_user_id;
  END IF;

  SELECT p.user_id INTO v_empty_user_id
  FROM public.profiles p
  WHERE p.id = v_empty_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'empty profile id=% not found', v_empty_id;
  END IF;

  IF v_empty_user_id IS DISTINCT FROM v_auth_id THEN
    RAISE EXCEPTION 'empty profile user_id=% does not match auth user %', v_empty_user_id, v_auth_id;
  END IF;

  SELECT
    (SELECT count(*) FROM public.film_ratings WHERE profile_id = v_empty_id),
    (SELECT count(*) FROM public.profile_film_lists WHERE profile_id = v_empty_id),
    (SELECT count(*) FROM public.profile_taste_cores WHERE profile_id = v_empty_id),
    (SELECT count(*) FROM public.profile_film_scores WHERE profile_id = v_empty_id),
    (SELECT count(*) FROM public.profile_score_rebuild_jobs WHERE profile_id = v_empty_id),
    (SELECT count(*) FROM public.profile_activity_logs WHERE profile_id = v_empty_id),
    (SELECT count(*) FROM public.top_picks WHERE profile_id = v_empty_id),
    (SELECT taste_profile IS NOT NULL OR taste_profile_updated_at IS NOT NULL
       FROM public.profiles WHERE id = v_empty_id)
  INTO v_ratings, v_lists, v_cores, v_scores, v_jobs, v_activity, v_picks, v_has_taste;

  IF v_ratings > 0 OR v_lists > 0 OR v_cores > 0 OR v_scores > 0
     OR v_jobs > 0 OR v_activity > 0 OR v_picks > 0 OR v_has_taste THEN
    RAISE EXCEPTION
      'empty profile is NOT empty (ratings=%, lists=%, cores=%, scores=%, jobs=%, activity=%, picks=%, taste=%). Aborting; do not delete.',
      v_ratings, v_lists, v_cores, v_scores, v_jobs, v_activity, v_picks, v_has_taste;
  END IF;

  -- Free unique index on user_id. CASCADE cleans any zero-row child tables.
  -- Explicit NULL of user_id before DELETE is unnecessary.
  DELETE FROM public.profiles WHERE id = v_empty_id;

  v_new_share_token := gen_random_uuid()::text;

  UPDATE public.profiles
  SET
    user_id = v_auth_id,
    share_token = v_new_share_token
  WHERE id = v_legacy_id;

  RAISE NOTICE 'migrated legacy_id=% auth_id=% old_share_token=% new_share_token=%',
    v_legacy_id, v_auth_id, v_legacy_share_token, v_new_share_token;
END;
$$;

-- Inspect inside the open transaction, then COMMIT or ROLLBACK.
SELECT id, slug, user_id, share_token
FROM public.profiles
WHERE slug = 'LEGACY_SLUG_OR_UUID'
   OR id::text = 'LEGACY_SLUG_OR_UUID';

COMMIT;
-- ROLLBACK;


-- =============================================================================
-- 4) ROLLBACK (only if you still have the pre-migration snapshot)
-- =============================================================================
-- After COMMIT, automatic ROLLBACK is impossible. Restore manually:
--
-- A) If you have NOT committed yet: run ROLLBACK; instead of COMMIT.
--
-- B) After COMMIT, restore from saved values:
--
-- BEGIN;
--
-- -- 1) Unlink legacy (and restore old share_token if desired)
-- UPDATE public.profiles
-- SET
--   user_id = NULL,
--   share_token = 'OLD_SHARE_TOKEN'   -- or leave rotated token
-- WHERE id = 'LEGACY_PROFILE_ID';
--
-- -- 2) Recreate empty auth profile (same shape as ensureAuthProfileForUser)
-- INSERT INTO public.profiles (id, user_id, slug, share_token, name)
-- VALUES (
--   'EMPTY_PROFILE_ID',                 -- optional: reuse old id if you saved it
--   'AUTH_USER_ID',
--   'EMPTY_SLUG',
--   'EMPTY_SHARE_TOKEN',                -- or gen_random_uuid()::text
--   NULL
-- );
--
-- COMMIT;
--
-- Note: child rows that CASCADE-deleted with the empty profile stay gone
-- (they should have been empty). Legacy child data was never moved.


-- =============================================================================
-- 5) POST-MIGRATION checks (one user)
-- =============================================================================
WITH params AS (
  SELECT
    'LEGACY_SLUG_OR_UUID'::text AS legacy_ref,
    'user@example.com'::text AS auth_ref,
    '00000000-0000-0000-0000-000000000000'::uuid AS deleted_empty_id
),
auth_user AS (
  SELECT u.id, u.email
  FROM auth.users u, params
  WHERE u.email = lower(trim(params.auth_ref)) OR u.id::text = params.auth_ref
),
legacy AS (
  SELECT p.*
  FROM public.profiles p, params
  WHERE p.slug = params.legacy_ref OR p.id::text = params.legacy_ref
)
SELECT
  (SELECT count(*) = 1 FROM legacy) AS legacy_still_exists,
  (SELECT l.user_id = a.id FROM legacy l CROSS JOIN auth_user a) AS legacy_linked_to_auth,
  (SELECT count(*) FROM public.profiles p JOIN auth_user a ON p.user_id = a.id) AS profiles_for_auth_user, -- expect 1
  (SELECT NOT EXISTS (
      SELECT 1 FROM public.profiles p, params WHERE p.id = params.deleted_empty_id
   )) AS empty_profile_gone,
  (SELECT count(*) FROM public.film_ratings r JOIN legacy l ON r.profile_id = l.id) AS legacy_ratings_intact,
  (SELECT count(*) FROM public.profile_film_lists x JOIN legacy l ON x.profile_id = l.id) AS legacy_lists_intact,
  (SELECT l.share_token FROM legacy l) AS current_share_token;  -- must differ from pre-migration token


-- =============================================================================
-- 6) THREE USERS — same transaction pattern, explicit params, no copy-paste traps
-- =============================================================================
-- Fill the VALUES list. Run emptiness checks for ALL three empty ids first.
-- Prefer one transaction for all three OR one transaction per user.

BEGIN;

DO $$
DECLARE
  r record;
  v_auth_id uuid;
  v_legacy_id uuid;
  v_legacy_user_id uuid;
  v_legacy_share_token text;
  v_empty_user_id uuid;
  v_new_share_token text;
  v_ratings bigint;
  v_lists bigint;
  v_cores bigint;
  v_scores bigint;
  v_jobs bigint;
  v_activity bigint;
  v_picks bigint;
  v_has_taste boolean;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- legacy_ref          , auth_ref              , empty_profile_id
      ('legacy-slug-1'::text, 'one@example.com'::text, '00000000-0000-0000-0000-000000000001'::uuid),
      ('legacy-slug-2',       'two@example.com',       '00000000-0000-0000-0000-000000000002'::uuid),
      ('legacy-slug-3',       'three@example.com',     '00000000-0000-0000-0000-000000000003'::uuid)
    ) AS t(legacy_ref, auth_ref, empty_profile_id)
  LOOP
    SELECT u.id INTO v_auth_id
    FROM auth.users u
    WHERE (u.email = lower(trim(r.auth_ref)) OR u.id::text = r.auth_ref)
      AND u.deleted_at IS NULL;

    IF v_auth_id IS NULL THEN
      RAISE EXCEPTION 'auth user not found for %', r.auth_ref;
    END IF;

    SELECT p.id, p.user_id, p.share_token
    INTO v_legacy_id, v_legacy_user_id, v_legacy_share_token
    FROM public.profiles p
    WHERE p.slug = r.legacy_ref OR p.id::text = r.legacy_ref;

    IF v_legacy_id IS NULL THEN
      RAISE EXCEPTION 'legacy profile not found for %', r.legacy_ref;
    END IF;

    IF v_legacy_id = r.empty_profile_id THEN
      RAISE EXCEPTION 'legacy/empty collision for %', r.legacy_ref;
    END IF;

    IF v_legacy_user_id IS NOT NULL AND v_legacy_user_id <> v_auth_id THEN
      RAISE EXCEPTION 'legacy % linked to other user %', r.legacy_ref, v_legacy_user_id;
    END IF;

    SELECT p.user_id INTO v_empty_user_id
    FROM public.profiles p
    WHERE p.id = r.empty_profile_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'empty profile missing %', r.empty_profile_id;
    END IF;

    IF v_empty_user_id IS DISTINCT FROM v_auth_id THEN
      RAISE EXCEPTION 'empty % not owned by auth %', r.empty_profile_id, v_auth_id;
    END IF;

    SELECT
      (SELECT count(*) FROM public.film_ratings WHERE profile_id = r.empty_profile_id),
      (SELECT count(*) FROM public.profile_film_lists WHERE profile_id = r.empty_profile_id),
      (SELECT count(*) FROM public.profile_taste_cores WHERE profile_id = r.empty_profile_id),
      (SELECT count(*) FROM public.profile_film_scores WHERE profile_id = r.empty_profile_id),
      (SELECT count(*) FROM public.profile_score_rebuild_jobs WHERE profile_id = r.empty_profile_id),
      (SELECT count(*) FROM public.profile_activity_logs WHERE profile_id = r.empty_profile_id),
      (SELECT count(*) FROM public.top_picks WHERE profile_id = r.empty_profile_id),
      (SELECT taste_profile IS NOT NULL OR taste_profile_updated_at IS NOT NULL
         FROM public.profiles WHERE id = r.empty_profile_id)
    INTO v_ratings, v_lists, v_cores, v_scores, v_jobs, v_activity, v_picks, v_has_taste;

    IF v_ratings > 0 OR v_lists > 0 OR v_cores > 0 OR v_scores > 0
       OR v_jobs > 0 OR v_activity > 0 OR v_picks > 0 OR v_has_taste THEN
      RAISE EXCEPTION
        'empty profile % is NOT empty for legacy %. Abort entire batch.',
        r.empty_profile_id, r.legacy_ref;
    END IF;

    DELETE FROM public.profiles WHERE id = r.empty_profile_id;

    v_new_share_token := gen_random_uuid()::text;

    UPDATE public.profiles
    SET user_id = v_auth_id, share_token = v_new_share_token
    WHERE id = v_legacy_id;

    RAISE NOTICE 'ok legacy=% -> auth=% new_token=% (old=%)',
      v_legacy_id, v_auth_id, v_new_share_token, v_legacy_share_token;
  END LOOP;
END;
$$;

COMMIT;
-- ROLLBACK;


-- =============================================================================
-- 7) Manual data checklist (fill before running)
-- =============================================================================
-- For each of the three people:
--   [ ] legacy slug (or profiles.id)
--   [ ] auth.users email (or id) — user must already exist / have registered
--   [ ] empty profiles.id (the row created by ensureAuthProfileForUser)
--   [ ] pre-migration legacy.share_token (save for rollback / link invalidation proof)
--   [ ] pre-migration empty.slug + empty.share_token + empty.id (for recreate rollback)
--   [ ] emptiness check is_safe_to_delete = true
--   [ ] legacy.user_id IS NULL (or already the target auth id)
--   [ ] notify user: old /p/{slug}?token=OLD_TOKEN write links stop working
--   [ ] after login they should land on legacy slug via resolve-by-user_id
--
-- WARNING: If empty profile is not empty (pending catalog action on signup,
-- accidental ratings, activity logs, score jobs, etc.), STOP. Decide whether
-- to merge those rows into the legacy profile first. Never DELETE a non-empty
-- empty_profile_id with this script.
-- =============================================================================
