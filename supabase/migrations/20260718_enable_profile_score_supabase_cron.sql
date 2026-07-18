-- Enable Supabase Cron dependencies and expose a Vault-backed worker call.
-- The actual Vault values and cron schedule are configured manually with:
-- supabase/manual/profile-score-worker-cron.sql.example

CREATE EXTENSION IF NOT EXISTS pg_cron
  WITH SCHEMA pg_catalog;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public.invoke_profile_score_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  worker_url text;
  worker_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO worker_url
  FROM vault.decrypted_secrets
  WHERE name = 'animationpre_profile_score_worker_url';

  SELECT decrypted_secret
  INTO worker_secret
  FROM vault.decrypted_secrets
  WHERE name = 'animationpre_profile_score_worker_secret';

  IF worker_url IS NULL OR worker_secret IS NULL THEN
    RAISE EXCEPTION
      'Profile score worker Vault secrets are not configured';
  END IF;

  SELECT net.http_get(
    url := worker_url,
    headers := jsonb_build_object(
      'Authorization',
      format('Bearer %s', worker_secret)
    ),
    timeout_milliseconds := 5000
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_profile_score_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_profile_score_worker() TO service_role;
