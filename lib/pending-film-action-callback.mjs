import { parsePendingFilmAction } from "./pending-film-action-core.mjs";

export const PENDING_FILM_ACTION_QUERY_PARAM = "pending_action";

/**
 * @param {import("./pending-film-action-core.mjs").PendingFilmAction} action
 * @returns {string}
 */
export function encodePendingFilmActionForCallback(action) {
  return Buffer.from(JSON.stringify(action), "utf8").toString("base64url");
}

/**
 * @param {string | null | undefined} value
 * @returns {import("./pending-film-action-core.mjs").PendingFilmAction | null}
 */
export function decodePendingFilmActionFromCallback(value) {
  if (!value) {
    return null;
  }

  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    return parsePendingFilmAction(JSON.parse(json));
  } catch {
    return null;
  }
}
