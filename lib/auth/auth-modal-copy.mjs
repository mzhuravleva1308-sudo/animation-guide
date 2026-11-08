/**
 * @typedef {'login' | 'save' | 'rating' | 'saved_tab' | 'watched_tab' | 'vibe_search'} AuthModalReason
 * @typedef {'email' | 'sent'} AuthModalStep
 * @typedef {{ title: string, description: string | null }} AuthModalCopy
 * @typedef {{ filmTitle?: string | null }} AuthModalCopyContext
 */

/**
 * @param {string | null | undefined} filmTitle
 * @returns {string}
 */
function resolveFilmTitle(filmTitle) {
  const trimmed = typeof filmTitle === "string" ? filmTitle.trim() : "";
  return trimmed.length > 0 ? trimmed : "this film";
}

/**
 * @param {AuthModalReason} reason
 * @param {AuthModalStep} step
 * @param {AuthModalCopyContext} [context]
 * @returns {AuthModalCopy}
 */
export function getAuthModalCopy(reason, step, context = {}) {
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
        description: `Build your own watchlist of indie and festival animation. We'll email you a sign-in link and add ${filmTitle} to your watchlist when you're in.`,
      };
    case "rating":
      return {
        title: `Save your rating for ${filmTitle}`,
        description:
          "We'll email you a sign-in link and save your rating when you're in. Your ratings help us find more indie and festival animation you might love.",
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

/**
 * @param {{ type: 'save' | 'rating' }} action
 * @returns {'save' | 'rating'}
 */
export function reasonFromPendingAction(action) {
  return action.type === "rating" ? "rating" : "save";
}

/**
 * @param {{ type: 'save', filmId: string, saved: boolean, filmTitle?: string } | { type: 'rating', filmId: string, rating: number | null, filmTitle?: string }} action
 */
export function toPendingFilmActionInput(action) {
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
