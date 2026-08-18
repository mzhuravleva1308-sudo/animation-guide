/**
 * Prose measure on guide pages.
 *
 * FilmCard on these pages is full container width, then
 * `sm:grid-cols-[140px_minmax(0,1fr)] md:grid-cols-[190px_minmax(0,1fr)]`
 * with text padding `sm:px-5` (2.5rem). Mobile stacks the poster, so prose
 * stays full content width (same as the card text block).
 */
export const GUIDE_PROSE_CLASS =
  "sm:max-w-[calc(100%-140px-2.5rem)] md:max-w-[calc(100%-190px-2.5rem)]";
