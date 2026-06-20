export const PENDING_FILM_ACTION_STORAGE_KEY =
  "animationpre:pending-film-action";
export const PENDING_FILM_ACTION_APPLIED_ID_STORAGE_KEY =
  "animationpre:pending-film-action-applied-id";

/**
 * @typedef {{ id: string, type: "save", filmId: string, saved: boolean }} PendingSaveAction
 * @typedef {{ id: string, type: "rating", filmId: string, rating: number | null }} PendingRatingAction
 * @typedef {PendingSaveAction | PendingRatingAction} PendingFilmAction
 */

/**
 * @param {string} prefix
 * @returns {string}
 */
export function createPendingFilmActionId(prefix = "pending") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {Omit<PendingSaveAction, "id"> | Omit<PendingRatingAction, "id">} action
 * @returns {PendingFilmAction}
 */
export function createPendingFilmAction(action) {
  return {
    ...action,
    id: createPendingFilmActionId(),
  };
}

/**
 * @param {unknown} value
 * @returns {PendingFilmAction | null}
 */
export function parsePendingFilmAction(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const action = /** @type {Record<string, unknown>} */ (value);

  if (typeof action.id !== "string" || typeof action.filmId !== "string") {
    return null;
  }

  if (action.type === "save") {
    return typeof action.saved === "boolean"
      ? /** @type {PendingSaveAction} */ (action)
      : null;
  }

  if (action.type === "rating") {
    if (action.rating === null) {
      return /** @type {PendingRatingAction} */ (action);
    }

    return typeof action.rating === "number" &&
      Number.isFinite(action.rating) &&
      action.rating >= 1 &&
      action.rating <= 10
      ? /** @type {PendingRatingAction} */ (action)
      : null;
  }

  return null;
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {PendingFilmAction | null}
 */
export function readPendingFilmAction(storage) {
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(PENDING_FILM_ACTION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return parsePendingFilmAction(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {PendingFilmAction} action
 */
export function storePendingFilmAction(storage, action) {
  if (!storage) {
    return;
  }

  storage.setItem(PENDING_FILM_ACTION_STORAGE_KEY, JSON.stringify(action));
}

/**
 * @param {Storage | null | undefined} storage
 */
export function clearPendingFilmAction(storage) {
  if (!storage) {
    return;
  }

  storage.removeItem(PENDING_FILM_ACTION_STORAGE_KEY);
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {string | null}
 */
export function readAppliedPendingFilmActionId(storage) {
  if (!storage) {
    return null;
  }

  const value = storage.getItem(PENDING_FILM_ACTION_APPLIED_ID_STORAGE_KEY);
  return value && value.length > 0 ? value : null;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} actionId
 */
export function markPendingFilmActionApplied(storage, actionId) {
  if (!storage) {
    return;
  }

  storage.setItem(PENDING_FILM_ACTION_APPLIED_ID_STORAGE_KEY, actionId);
  storage.removeItem(PENDING_FILM_ACTION_STORAGE_KEY);
}

/**
 * @param {Storage | null | undefined} storage
 * @param {PendingFilmAction | null | undefined} action
 * @returns {boolean}
 */
export function shouldApplyPendingFilmAction(storage, action) {
  if (!action) {
    return false;
  }

  return readAppliedPendingFilmActionId(storage) !== action.id;
}

/**
 * @param {PendingFilmAction} action
 * @returns {PendingFilmAction}
 */
export function clonePendingFilmAction(action) {
  return { ...action };
}
