-- Link confirmed claims to recognition rows (requires film_festival_recognitions).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'film_festival_claims_recognition_id_fkey'
  ) THEN
    ALTER TABLE public.film_festival_claims
      ADD CONSTRAINT film_festival_claims_recognition_id_fkey
      FOREIGN KEY (recognition_id)
      REFERENCES public.film_festival_recognitions (id)
      ON DELETE SET NULL;
  END IF;
END $$;
