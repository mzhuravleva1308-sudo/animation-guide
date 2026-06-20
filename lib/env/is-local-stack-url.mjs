/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isLocalStackUrl(value) {
  if (!value?.trim()) {
    return false;
  }

  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isLocalSupabaseUrl(value) {
  if (!value?.trim()) {
    return false;
  }

  try {
    const url = new URL(value.trim());
    const host = `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
    return (
      host === "127.0.0.1:54321" ||
      host === "localhost:54321" ||
      isLocalStackUrl(value)
    );
  } catch {
    return false;
  }
}
