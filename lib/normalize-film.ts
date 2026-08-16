import { normalizeFilmTagList } from "@/lib/film-tags";
import { Film } from "@/types/film";

export function normalizeFilm(film: Film): Film {
  return {
    ...film,
    moods: normalizeFilmTagList(film.moods),
    aesthetic_tags: normalizeFilmTagList(film.aesthetic_tags),
    visual_world_tags: normalizeFilmTagList(film.visual_world_tags),
    storytelling_tags: normalizeFilmTagList(film.storytelling_tags),
    narrative_tags: normalizeFilmTagList(film.narrative_tags),
    themes: normalizeFilmTagList(film.themes),
  };
}

export function normalizeFilms(films: Film[]): Film[] {
  return films.map(normalizeFilm);
}
