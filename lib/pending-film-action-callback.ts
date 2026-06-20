import {
  parsePendingFilmAction,
  type PendingFilmAction,
} from "@/lib/pending-film-action";

export const PENDING_FILM_ACTION_QUERY_PARAM = "pending_action";

function toBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function encodePendingFilmActionForCallback(
  action: PendingFilmAction
): string {
  return toBase64Url(JSON.stringify(action));
}

export function decodePendingFilmActionFromCallback(
  value: string | null | undefined
): PendingFilmAction | null {
  if (!value) {
    return null;
  }

  try {
    return parsePendingFilmAction(JSON.parse(fromBase64Url(value)));
  } catch {
    return null;
  }
}
