-- Editorial copy for film cards: concrete framing and mood line

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS what_it_is text,
  ADD COLUMN IF NOT EXISTS the_mood text;
