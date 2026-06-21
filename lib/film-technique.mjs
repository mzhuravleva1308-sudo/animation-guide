const MAX_TECHNIQUE_PILLS = 2;

function splitTechniqueValues(value) {
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

export function getFilmTechniquePills(technique, maxCount = MAX_TECHNIQUE_PILLS) {
  const parts = splitTechniqueValues(technique);
  const seen = new Set();
  const pills = [];

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
