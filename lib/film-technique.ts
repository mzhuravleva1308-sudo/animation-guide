const MAX_TECHNIQUE_PILLS = 2;

function splitTechniqueValues(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => splitTechniqueValues(item)).filter(Boolean);
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

export function getFilmTechniquePills(
  technique: unknown,
  maxCount = MAX_TECHNIQUE_PILLS
): string[] {
  const parts = splitTechniqueValues(technique);
  const seen = new Set<string>();
  const pills: string[] = [];

  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    pills.push(part);

    if (pills.length >= maxCount) {
      break;
    }
  }

  return pills;
}
