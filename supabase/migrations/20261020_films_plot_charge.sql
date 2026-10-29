-- Plot Charge: what unfolds that gives the story its hook (independent of plot tags).
-- Shape: { "headline": string, "charge_lines": string[], "confidence"?: "high"|"medium"|"low" }

ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS plot_charge jsonb;
