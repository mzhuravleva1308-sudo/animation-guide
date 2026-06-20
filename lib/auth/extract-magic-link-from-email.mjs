/**
 * @param {string} value
 * @returns {string}
 */
function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/**
 * Detects broken links like http://127.0.0.1:3000&token_hash=... where token_hash
 * was appended to the site root instead of /auth/callback?...
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isMalformedAuthEmailLink(url) {
  if (!url?.trim()) {
    return false;
  }

  if (/^https?:\/\/[^/?#]+&/i.test(url)) {
    return true;
  }

  try {
    const parsed = new URL(url);

    if (
      parsed.pathname.includes("/auth/callback") ||
      parsed.pathname.includes("/auth/v1/verify")
    ) {
      return false;
    }

    return parsed.searchParams.has("token_hash");
  } catch {
    return /^https?:\/\/[^/?#]+&token_hash=/i.test(url);
  }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isSignInMagicLink(url) {
  if (!url?.trim() || isMalformedAuthEmailLink(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);

    if (parsed.pathname.includes("/auth/v1/verify")) {
      return true;
    }

    if (
      parsed.pathname.includes("/auth/callback") &&
      (parsed.searchParams.has("token_hash") || parsed.searchParams.has("code"))
    ) {
      return true;
    }

    return false;
  } catch {
    return (
      /\/auth\/v1\/verify/i.test(url) ||
      (/token_hash=/i.test(url) &&
        /type=(magiclink|email|signup|invite|recovery|email_change)/i.test(url))
    );
  }
}

/**
 * @param {string | null | undefined} content
 * @returns {string | null}
 */
export function extractMagicLinkFromEmailContent(content) {
  if (!content?.trim()) {
    return null;
  }

  const candidates = [];

  const hrefPattern = /href=["']([^"']+)["']/gi;
  let match = hrefPattern.exec(content);
  while (match) {
    candidates.push(decodeHtmlEntities(match[1]));
    match = hrefPattern.exec(content);
  }

  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  match = urlPattern.exec(content);
  while (match) {
    candidates.push(match[0]);
    match = urlPattern.exec(content);
  }

  for (const candidate of candidates) {
    if (isSignInMagicLink(candidate)) {
      return candidate;
    }
  }

  return null;
}
