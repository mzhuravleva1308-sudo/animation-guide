import { normalizeFilmTagList } from "@/lib/film-tags";
import { Film } from "@/types/film";

export function normalizeFilm(film: Film): Film {
  return {
    ...film,
    moods: normalizeFilmTagList(film.moods),
    aesthetic_tags: normalizeFilmTagList(film.aesthetic_tags),
    narrative_tags: normalizeFilmTagList(film.narrative_tags),
    themes: normalizeFilmTagList(film.themes),
  };
}

export function normalizeFilms(films: Film[]): Film[] {
  return films.map(normalizeFilm);
}
