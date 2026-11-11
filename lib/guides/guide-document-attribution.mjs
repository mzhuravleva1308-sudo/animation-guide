/** Visible byline + JSON-LD / Open Graph author for editorial guides. */
export const GUIDE_DOCUMENT_AUTHOR = "Maria";

/** Stable Person fragment; full `@id` is `${origin}/#maria`. */
export const GUIDE_DOCUMENT_AUTHOR_ID_FRAGMENT = "maria";

/**
 * @param {string} origin
 * @returns {string}
 */
export function guideDocumentAuthorId(origin) {
  const base = String(origin ?? "").replace(/\/$/, "");
  return `${base}/#${GUIDE_DOCUMENT_AUTHOR_ID_FRAGMENT}`;
}

/**
 * Self-contained Person node for JSON-LD graphs.
 * @param {string} origin
 */
export function buildGuideDocumentAuthorNode(origin) {
  return {
    "@type": "Person",
    "@id": guideDocumentAuthorId(origin),
    name: GUIDE_DOCUMENT_AUTHOR,
  };
}

/** Format YYYY-MM-DD editorial dates for the guide byline (UTC calendar day). */
export function formatGuideEditorialDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? "").trim());
  if (!match) {
    return String(isoDate ?? "").trim();
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
