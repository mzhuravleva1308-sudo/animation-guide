export type FilmIdentity = {
  id?: string;
  title: string;
  original_title?: string | null;
  director?: string | null;
  year?: number | null;
  country?: string | null;
  duration_minutes?: number | null;
  source_url?: string | null;
  watch_url?: string | null;
  trailer_url?: string | null;
  tmdb_id?: number | null;
  imdb_id?: string | null;
};

export type DuplicateMatch = {
  existingFilm: FilmIdentity;
  score: number;
  isHardDuplicate: boolean;
  reasons: string[];
};

export type InsertBlockReason = "hard_duplicate" | "possible_duplicate" | null;
