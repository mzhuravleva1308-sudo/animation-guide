export type ProfileActivityEventType =
  | "profile_view"
  | "tab_view"
  | "rating_set"
  | "rating_removed"
  | "film_saved"
  | "film_unsaved"
  | "film_watched"
  | "film_unwatched"
  | "pagination_next"
  | "pagination_prev";

export type ProfileActivityLogInput = {
  profileId: string;
  filmId?: string | null;
  eventType: ProfileActivityEventType;
  eventData?: Record<string, unknown>;
  userAgent?: string | null;
  referrer?: string | null;
};
