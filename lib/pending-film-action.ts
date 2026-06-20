export const PENDING_FILM_ACTION_STORAGE_KEY =
  "animationpre:pending-film-action";
export const PENDING_FILM_ACTION_APPLIED_ID_STORAGE_KEY =
  "animationpre:pending-film-action-applied-id";

export type PendingSaveAction = {
  id: string;
  type: "save";
  filmId: string;
  saved: boolean;
};

export type PendingRatingAction = {
  id: string;
  type: "rating";
  filmId: string;
  rating: number | null;
};

export type PendingFilmAction = PendingSaveAction | PendingRatingAction;

export type PendingFilmActionInput =
  | Omit<PendingSaveAction, "id">
  | Omit<PendingRatingAction, "id">;

export function createPendingFilmActionId(prefix = "pending"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPendingFilmAction(
  action: PendingFilmActionInput
): PendingFilmAction {
  return {
    ...action,
    id: createPendingFilmActionId(),
  };
}

export function parsePendingFilmAction(value: unknown): PendingFilmAction | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const action = value as Record<string, unknown>;

  if (typeof action.id !== "string" || typeof action.filmId !== "string") {
    return null;
  }

  if (action.type === "save") {
    return typeof action.saved === "boolean"
      ? (action as PendingSaveAction)
      : null;
  }

  if (action.type === "rating") {
    if (action.rating === null) {
      return action as PendingRatingAction;
    }

    return typeof action.rating === "number" &&
      Number.isFinite(action.rating) &&
      action.rating >= 1 &&
      action.rating <= 10
      ? (action as PendingRatingAction)
      : null;
  }

  return null;
}

export function readPendingFilmAction(
  storage: Storage | null | undefined
): PendingFilmAction | null {
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

export function storePendingFilmAction(
  storage: Storage | null | undefined,
  action: PendingFilmAction
): void {
  if (!storage) {
    return;
  }

  storage.setItem(PENDING_FILM_ACTION_STORAGE_KEY, JSON.stringify(action));
}

export function clearPendingFilmAction(
  storage: Storage | null | undefined
): void {
  if (!storage) {
    return;
  }

  storage.removeItem(PENDING_FILM_ACTION_STORAGE_KEY);
}

export function readAppliedPendingFilmActionId(
  storage: Storage | null | undefined
): string | null {
  if (!storage) {
    return null;
  }

  const value = storage.getItem(PENDING_FILM_ACTION_APPLIED_ID_STORAGE_KEY);
  return value && value.length > 0 ? value : null;
}

export function markPendingFilmActionApplied(
  storage: Storage | null | undefined,
  actionId: string
): void {
  if (!storage) {
    return;
  }

  storage.setItem(PENDING_FILM_ACTION_APPLIED_ID_STORAGE_KEY, actionId);
  storage.removeItem(PENDING_FILM_ACTION_STORAGE_KEY);
}

export function shouldApplyPendingFilmAction(
  storage: Storage | null | undefined,
  action: PendingFilmAction | null | undefined
): boolean {
  if (!action) {
    return false;
  }

  return readAppliedPendingFilmActionId(storage) !== action.id;
}

export function clonePendingFilmAction(
  action: PendingFilmAction
): PendingFilmAction {
  return { ...action };
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storePendingFilmActionForSession(
  action: PendingFilmActionInput
): PendingFilmAction {
  const pendingAction = createPendingFilmAction(action);
  storePendingFilmAction(getSessionStorage(), pendingAction);
  return pendingAction;
}

export function readPendingFilmActionFromSession(): PendingFilmAction | null {
  return readPendingFilmAction(getSessionStorage());
}

export function clearPendingFilmActionFromSession(): void {
  clearPendingFilmAction(getSessionStorage());
}
