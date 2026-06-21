-- AI-generated taste-facing film descriptions

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS feels_like text,
  ADD COLUMN IF NOT EXISTS choose_if text;
