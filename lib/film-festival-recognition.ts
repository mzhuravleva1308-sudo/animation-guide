export {
  FILM_FESTIVAL_RECOGNITION_TYPES,
  FILM_FESTIVAL_AWARD_LEVELS,
  buildFestivalRecognitionDedupeKey,
  getFestivalRecognitionSignalWeight,
  normalizeAwardLevel,
  normalizeAwardName,
  normalizeFestivalName,
  normalizeFestivalYear,
  normalizeOptionalText,
  normalizeRecognitionType,
  normalizeSourceUrl,
  parseFilmFestivalRecognitionImportEntry,
  parseFilmFestivalRecognitionImportPayload,
  parseFilmFestivalRecognitionInput,
  parseFilmFestivalRecognitionInputs,
  resolveFilmIdForFestivalImportEntry,
  toFilmFestivalRecognitionRow,
  upsertFilmFestivalRecognitions,
} from "./film-festival-recognition.mjs";

export type {
  FilmFestivalAwardLevel,
  FilmFestivalRecognition,
  FilmFestivalRecognitionImportEntry,
  FilmFestivalRecognitionInput,
  FilmFestivalRecognitionType,
} from "@/types/film-festival-recognition";
