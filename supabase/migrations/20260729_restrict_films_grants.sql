-- Restrict public.films to read-only for anon and authenticated.
-- Catalog mutations (import, editorial, batch) use service_role server-side.
-- This migration changes access controls only; it does not change data or schema.

REVOKE ALL ON TABLE public.films FROM anon, authenticated;
GRANT SELECT ON TABLE public.films TO anon, authenticated;
GRANT ALL ON TABLE public.films TO service_role;
