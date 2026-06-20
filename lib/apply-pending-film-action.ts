import {
  markPendingFilmActionApplied,
  readAppliedPendingFilmActionId,
  readPendingFilmAction,
  shouldApplyPendingFilmAction,
  type PendingFilmAction,
} from "@/lib/pending-film-action";
import {
  persistFilmRating,
  persistFilmSave,
} from "@/lib/film-profile-mutations";

export type ApplyPendingFilmActionResult =
  | { status: "none" }
  | { status: "already_applied"; actionId: string }
  | { status: "applied"; action: PendingFilmAction }
  | { status: "error"; action: PendingFilmAction; message: string };

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

export async function applyPendingFilmAction({
  profileId,
  storage = getSessionStorage(),
}: {
  profileId: string;
  storage?: Storage | null;
}): Promise<ApplyPendingFilmActionResult> {
  const pendingAction = readPendingFilmAction(storage);

  if (!pendingAction) {
    return { status: "none" };
  }

  if (!shouldApplyPendingFilmAction(storage, pendingAction)) {
    return { status: "already_applied", actionId: pendingAction.id };
  }

  const mutationResult =
    pendingAction.type === "save"
      ? await persistFilmSave({
          profileId,
          filmId: pendingAction.filmId,
          saved: pendingAction.saved,
        })
      : await persistFilmRating({
          profileId,
          filmId: pendingAction.filmId,
          rating: pendingAction.rating,
        });

  if (mutationResult.error) {
    return {
      status: "error",
      action: pendingAction,
      message: mutationResult.error.message,
    };
  }

  markPendingFilmActionApplied(storage, pendingAction.id);

  return { status: "applied", action: pendingAction };
}

export function getPendingFilmActionForApply(
  storage: Storage | null = getSessionStorage()
): PendingFilmAction | null {
  return readPendingFilmAction(storage);
}

export function getAppliedPendingFilmActionId(
  storage: Storage | null = getSessionStorage()
): string | null {
  return readAppliedPendingFilmActionId(storage);
}
