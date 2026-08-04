-- Weekly film discovery staging (candidates awaiting manual approve/reject).
-- These rows are NOT catalog films: approve does not insert into public.films,
-- does not set catalog_visible, and does not run enrichment.

CREATE TABLE IF NOT EXISTS public.film_discovery_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (
      status IN (
        'running',
        'completed',
        'completed_incomplete',
        'failed'
      )
    ),
  manager_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  research_rounds integer NOT NULL DEFAULT 0
    CHECK (research_rounds >= 0 AND research_rounds <= 3),
  passed_count integer NOT NULL DEFAULT 0 CHECK (passed_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  incomplete boolean NOT NULL DEFAULT false,
  incomplete_notes text,
  rejection_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT film_discovery_batches_week_key_unique UNIQUE (week_key)
);

CREATE TABLE IF NOT EXISTS public.film_discovery_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.film_discovery_batches (id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'weekly_discovery'
    CHECK (
      source IN (
        'weekly_discovery',
        'manual_seed'
      )
    ),
  title text NOT NULL,
  original_title text,
  year integer NOT NULL CHECK (year >= 1888 AND year <= 2100),
  directors text[] NOT NULL DEFAULT '{}'::text[],
  countries text[] NOT NULL DEFAULT '{}'::text[],
  runtime_minutes integer CHECK (runtime_minutes IS NULL OR runtime_minutes >= 1),
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  manager_why text,
  researcher_why text,
  eligibility_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_result text
    CHECK (
      eligibility_result IS NULL
      OR eligibility_result IN ('PASS', 'FAIL')
    ),
  eligibility_reasons text[] NOT NULL DEFAULT '{}'::text[],
  eligibility_missing text[] NOT NULL DEFAULT '{}'::text[],
  eligibility_fix_hints text[] NOT NULL DEFAULT '{}'::text[],
  -- Manual review lifecycle. Never maps to films.catalog_visible / published.
  review_status text NOT NULL DEFAULT 'pending_review'
    CHECK (
      review_status IN (
        'pending_review',
        'approved',
        'rejected'
      )
    ),
  reject_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  -- Identity helpers for dedupe (same normalize rules as films)
  normalized_title text,
  normalized_original_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS film_discovery_candidates_review_status_idx
  ON public.film_discovery_candidates (review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS film_discovery_candidates_identity_idx
  ON public.film_discovery_candidates (normalized_title, year);

CREATE INDEX IF NOT EXISTS film_discovery_candidates_batch_idx
  ON public.film_discovery_candidates (batch_id);

CREATE INDEX IF NOT EXISTS film_discovery_candidates_source_idx
  ON public.film_discovery_candidates (source);

-- Prevent two active review rows for the same title+year.
CREATE UNIQUE INDEX IF NOT EXISTS film_discovery_candidates_active_title_year_uidx
  ON public.film_discovery_candidates (normalized_title, year)
  WHERE review_status IN ('pending_review', 'approved')
    AND normalized_title IS NOT NULL
    AND normalized_title <> '';

CREATE OR REPLACE FUNCTION public.film_discovery_candidates_set_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_title := public.normalize_film_title(NEW.title);
  NEW.normalized_original_title :=
    CASE
      WHEN NEW.original_title IS NULL OR btrim(NEW.original_title) = '' THEN NULL
      ELSE public.normalize_film_title(NEW.original_title)
    END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_discovery_candidates_identity_trg
  ON public.film_discovery_candidates;
CREATE TRIGGER film_discovery_candidates_identity_trg
  BEFORE INSERT OR UPDATE OF title, original_title
  ON public.film_discovery_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.film_discovery_candidates_set_identity();

ALTER TABLE public.film_discovery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_discovery_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.film_discovery_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.film_discovery_candidates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.film_discovery_batches TO service_role;
GRANT ALL ON TABLE public.film_discovery_candidates TO service_role;
