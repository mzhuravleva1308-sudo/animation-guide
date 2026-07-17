/**
 * Return the ordinary film description shown above the mood note.
 *
 * `what_it_is` remains a compatibility fallback for older records that do
 * not have a synopsis, but it is never rendered in addition to synopsis.
 *
 * @param {{ synopsis?: string | null, what_it_is?: string | null }} film
 */
export function getFilmCardSynopsis(film) {
  const synopsis = film.synopsis?.trim();

  if (synopsis) {
    return synopsis;
  }

  const whatItIs = film.what_it_is?.trim();
  return whatItIs || null;
}

/** @param {{ the_mood?: string | null }} film */
export function getFilmCardMood(film) {
  const mood = film.the_mood?.trim();
  return mood || null;
}
