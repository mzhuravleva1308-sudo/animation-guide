/**
 * Prose measure on guide pages.
 *
 * Aligns with FilmCard text column once the card switches to the wide
 * side-poster layout at 900px (140px poster + px-5), then 1100px (190px).
 * Below 900px the compact card is full width, so prose stays full width too.
 */
export const GUIDE_PROSE_CLASS =
  "min-[900px]:max-w-[calc(100%-140px-2.5rem)] min-[1100px]:max-w-[calc(100%-190px-2.5rem)]";
