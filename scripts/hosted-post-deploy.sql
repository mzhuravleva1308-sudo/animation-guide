-- Run once in Supabase Dashboard → SQL Editor (project lrvbudyveqofxvlkqjsd)
-- Then: npm run hosted:sync-editorial

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS feels_like text,
  ADD COLUMN IF NOT EXISTS choose_if text;

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS what_it_is text,
  ADD COLUMN IF NOT EXISTS the_mood text;
