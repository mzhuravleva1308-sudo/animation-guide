-- PostgREST upsert uses film_id + dedupe_key; import_key remains metadata only.
DROP INDEX IF EXISTS public.film_festival_recognitions_import_key_unique;
