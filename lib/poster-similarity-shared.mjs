/**
 * Client-safe poster similarity labels (no sharp / Node APIs).
 */

export const POSTER_SIMILARITY = Object.freeze({
  same: "same",
  similar: "similar",
  different: "different",
  unknown: "unknown",
});

/**
 * @param {string} verdict
 * @returns {string}
 */
export function formatPosterSimilarityLabel(verdict) {
  switch (verdict) {
    case POSTER_SIMILARITY.same:
      return "Same poster";
    case POSTER_SIMILARITY.similar:
      return "Similar poster";
    case POSTER_SIMILARITY.different:
      return "Different posters";
    default:
      return "Poster not compared";
  }
}
