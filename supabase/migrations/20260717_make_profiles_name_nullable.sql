-- Profile names are optional. The application uses the slug as the display fallback.
ALTER TABLE public.profiles
  ALTER COLUMN name DROP NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN share_token SET DEFAULT gen_random_uuid();
