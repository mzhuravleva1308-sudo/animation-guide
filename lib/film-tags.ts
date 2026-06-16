export function normalizeFilmTagList(
  value: string[] | string | null | undefined
): string[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeFilmTagList(item)).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }

  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [trimmed];
}
