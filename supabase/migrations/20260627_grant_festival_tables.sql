-- Ensure PostgREST roles can read festival QA tables created after initial grants.

GRANT SELECT ON public.film_festival_recognitions TO anon, authenticated;
GRANT SELECT ON public.film_festival_claims TO anon, authenticated;
GRANT ALL ON public.film_festival_recognitions TO service_role;
GRANT ALL ON public.film_festival_claims TO service_role;
