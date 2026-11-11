import type { PendingFilmActionInput } from "@/lib/pending-film-action";

export type AuthModalReason =
  | "login"
  | "save"
  | "rating"
  | "saved_tab"
  | "watched_tab"
  | "vibe_search";

export type AuthModalStep = "email" | "sent";

export type AuthModalCopy = {
  title: string;
  description: string | null;
};

export type AuthRequiredAction = PendingFilmActionInput & {
  filmTitle?: string;
};

export type AuthModalCopyContext = {
  filmTitle?: string | null;
};

function resolveFilmTitle(filmTitle?: string | null): string {
  const trimmed = filmTitle?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "this film";
}

export function getAuthModalCopy(
  reason: AuthModalReason,
  step: AuthModalStep,
  context: AuthModalCopyContext = {}
): AuthModalCopy {
  if (step === "sent") {
    return {
      title: "Check your inbox",
      description: null,
    };
  }

  const filmTitle = resolveFilmTitle(context.filmTitle);

  switch (reason) {
    case "save":
      return {
        title: `Save ${filmTitle} for later`,
        description: `Keep your indie and festival animation finds in one place. Sign in with the link we email you, and we'll add ${filmTitle} to your watchlist.`,
      };
    case "rating":
      return {
        title: `Save your rating for ${filmTitle}`,
        description:
          "We'll show you more indie and festival animation like the films you rate highly. Enter your email for a sign-in link, and we'll save your rating when you sign in.",
      };
    case "vibe_search":
      return {
        title: "Find animation that fits your mood",
        description:
          'Describe what you\'d like to watch. Try "a quiet film with a dreamlike world" or "something handmade, warm, and a little eerie." We\'ll email you a link to sign in and start searching.',
      };
    case "saved_tab":
      return {
        title: "Log in to see Saved",
        description:
          "Enter your email and we'll send a sign-in link to open your list.",
      };
    case "watched_tab":
      return {
        title: "Log in to see Watched",
        description:
          "Enter your email and we'll send a sign-in link to open your ratings.",
      };
    case "login":
    default:
      return {
        title: "Log in",
        description: "Enter your email and we'll send you a sign-in link.",
      };
  }
}

export function reasonFromPendingAction(
  action: Pick<PendingFilmActionInput, "type">
): Extract<AuthModalReason, "save" | "rating"> {
  return action.type === "rating" ? "rating" : "save";
}

export function toPendingFilmActionInput(
  action: AuthRequiredAction
): PendingFilmActionInput {
  if (action.type === "save") {
    return {
      type: "save",
      filmId: action.filmId,
      saved: action.saved,
    };
  }

  return {
    type: "rating",
    filmId: action.filmId,
    rating: action.rating,
  };
}
