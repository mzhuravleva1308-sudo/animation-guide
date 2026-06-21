import {
  inferFestivalYearFromSourceUrl,
  resolveCanonicalFestival,
  resolveConfidenceStatus,
} from "./festival-canonical-identity.mjs";
import {
  buildFestivalRecognitionDedupeKey,
  normalizeAwardName,
  normalizeOptionalText,
} from "./film-festival-recognition.mjs";

/**
 * @typedef {Record<string, unknown>} RecognitionRow
 *
 * @typedef {{
 *   action: "update" | "delete" | "keep",
 *   reason: string,
 *   before: RecognitionRow,
 *   after?: RecognitionRow | null,
 *   merge_target_id?: string | null,
 * }} NormalizationAction
 */

/**
 * @param {RecognitionRow} row
 */
export function migrateRecognitionModelFields(row) {
  let recognitionType = String(row.recognition_type ?? "");
  let awardResult = normalizeOptionalText(row.award_result ?? row.award_level);
  const awardName = normalizeOptionalText(row.award_name);

  if (recognitionType === "winner") {
    recognitionType = "award";
    if (awardResult === "grand_prize") {
      awardResult = "grand_prize";
    } else if (!awardResult) {
      awardResult = "winner";
    }
  } else if (recognitionType === "nominee") {
    recognitionType = "nomination";
    awardResult = "nominee";
  } else if (recognitionType === "award") {
    recognitionType = "award";
    if (awardResult === "jury_prize") {
      awardResult = "jury_prize";
    } else if (awardResult === "grand_prize") {
      awardResult = "grand_prize";
    } else if (awardResult === "mention") {
      awardResult = "mention";
    } else if (!awardResult) {
      awardResult = "winner";
    }
  } else if (recognitionType === "special_mention") {
    recognitionType = "award";
    awardResult = "mention";
  }

  return {
    recognition_type: recognitionType,
    award_result: awardResult,
    award_name: awardName,
    award_level: null,
  };
}

/**
 * @param {RecognitionRow} row
 */
export function normalizeRecognitionRow(row) {
  const sourceDisplayName =
    normalizeOptionalText(row.source_display_name) ??
    normalizeOptionalText(row.festival_name);
  const canonical = resolveCanonicalFestival(sourceDisplayName);
  const model = migrateRecognitionModelFields(row);

  let festivalYear =
    typeof row.festival_year === "number" ? row.festival_year : null;
  if (festivalYear == null) {
    festivalYear = inferFestivalYearFromSourceUrl(row.source_url);
  }

  const normalizedAwardName = normalizeAwardName(model.award_name);
  const normalizedFestivalKey =
    canonical.id ?? normalizeOptionalText(row.normalized_festival_name) ?? null;

  /** @type {RecognitionRow} */
  const normalized = {
    ...row,
    source_display_name: sourceDisplayName,
    canonical_festival_id: canonical.id,
    canonical_festival_name: canonical.name,
    festival_name: canonical.name ?? sourceDisplayName,
    normalized_festival_name: normalizedFestivalKey,
    festival_year: festivalYear,
    recognition_type: model.recognition_type,
    award_name: model.award_name,
    normalized_award_name: normalizedAwardName,
    award_result: model.award_result,
    award_level: null,
    section: normalizeOptionalText(row.section),
    source_url: normalizeOptionalText(row.source_url),
    source_label: normalizeOptionalText(row.source_label),
    source_type: normalizeOptionalText(row.source_type),
    original_text: normalizeOptionalText(row.original_text),
    import_source: normalizeOptionalText(row.import_source),
    import_key: normalizeOptionalText(row.import_key),
    dedupe_key: buildFestivalRecognitionDedupeKey({
      normalized_festival_name: normalizedFestivalKey ?? "unknown-festival",
      festival_year: festivalYear,
      recognition_type: model.recognition_type,
      normalized_award_name: normalizedAwardName,
      section: normalizeOptionalText(row.section),
      award_result: model.award_result,
    }),
  };

  normalized.confidence_status = resolveConfidenceStatus(normalized);
  return normalized;
}

/**
 * @param {RecognitionRow} row
 * @param {"strict" | "participation"} mode
 */
function mergeGroupKey(row, mode = "strict") {
  const awardSignature =
    row.recognition_type === "award" || row.recognition_type === "nomination"
      ? [
          row.normalized_award_name ?? row.award_name ?? "",
          row.award_result ?? "",
        ].join("::")
      : mode === "participation"
        ? "participation"
        : row.recognition_type;

  return [
    row.film_id,
    row.canonical_festival_id ?? row.normalized_festival_name ?? row.festival_name,
    row.festival_year ?? "unknown-year",
    awardSignature,
  ].join("|");
}

/**
 * @param {RecognitionRow} left
 * @param {RecognitionRow} right
 */
function choosePreferredRow(left, right) {
  const rank = (row) => {
    if (row.confidence_status === "confirmed_official") {
      return 100;
    }
    if (row.confidence_status === "wikipedia_discovery_unverified") {
      return 40;
    }
    if (row.confidence_status === "catalog_claim_unverified") {
      return 20;
    }
    if (row.confidence_status === "incomplete_candidate") {
      return 10;
    }
    return 0;
  };

  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank !== rightRank) {
    return leftRank > rightRank ? left : right;
  }

  if (Boolean(left.source_url) !== Boolean(right.source_url)) {
    return left.source_url ? left : right;
  }

  if (
    left.canonical_festival_id === "berlinale" &&
    right.canonical_festival_id === "berlinale"
  ) {
    return left.source_type === "official_archive" ? left : right;
  }

  return left.updated_at >= right.updated_at ? left : right;
}

/**
 * @param {RecognitionRow[]} rows
 */
export function buildFestivalRecognitionNormalizationPlan(rows) {
  const normalizedRows = rows.map((row) => normalizeRecognitionRow(row));
  /** @type {NormalizationAction[]} */
  const actions = [];
  /** @type {Set<string>} */
  const deleteIds = new Set();

  /** @type {Map<string, RecognitionRow[]>} */
  const exactGroups = new Map();
  for (const row of normalizedRows) {
    const exactKey = [
      row.film_id,
      row.dedupe_key,
    ].join("::");
    const group = exactGroups.get(exactKey) ?? [];
    group.push(row);
    exactGroups.set(exactKey, group);
  }

  for (const group of exactGroups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const preferred = group.reduce(choosePreferredRow);
    for (const row of group) {
      if (row.id === preferred.id) {
        actions.push({
          action: "update",
          reason: "Exact duplicate merged; kept preferred row.",
          before: rows.find((original) => original.id === row.id) ?? row,
          after: preferred,
          merge_target_id: preferred.id,
        });
        continue;
      }

      deleteIds.add(String(row.id));
      actions.push({
        action: "delete",
        reason: "Exact duplicate merged into preferred row.",
        before: rows.find((original) => original.id === row.id) ?? row,
        after: null,
        merge_target_id: preferred.id,
      });
    }
  }

  /** @type {Map<string, RecognitionRow[]>} */
  const eventGroups = new Map();
  for (const row of normalizedRows) {
    if (deleteIds.has(String(row.id))) {
      continue;
    }

    const key = mergeGroupKey(row, "participation");
    const group = eventGroups.get(key) ?? [];
    group.push(row);
    eventGroups.set(key, group);
  }

  /** @type {Map<string, RecognitionRow>} */
  const survivors = new Map(
    normalizedRows
      .filter((row) => !deleteIds.has(String(row.id)))
      .map((row) => [String(row.id), row])
  );

  for (const group of eventGroups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const preferred = group.reduce(choosePreferredRow);
    for (const row of group) {
      if (row.id === preferred.id) {
        continue;
      }

      if (
        row.canonical_festival_id &&
        preferred.canonical_festival_id &&
        row.canonical_festival_id === preferred.canonical_festival_id &&
        row.festival_year === preferred.festival_year
      ) {
        deleteIds.add(String(row.id));
        survivors.delete(String(row.id));
        actions.push({
          action: "delete",
          reason:
            "Same canonical festival event represented by multiple source names; kept official/preferred row.",
          before: rows.find((original) => original.id === row.id) ?? row,
          after: null,
          merge_target_id: preferred.id,
        });
        actions.push({
          action: "update",
          reason:
            "Merged duplicate festival event into canonical/preferred representation.",
          before: rows.find((original) => original.id === preferred.id) ?? preferred,
          after: {
            ...preferred,
            recognition_type:
              preferred.confidence_status === "confirmed_official"
                ? preferred.recognition_type
                : row.recognition_type,
            source_display_name:
              preferred.source_display_name ?? row.source_display_name,
          },
          merge_target_id: preferred.id,
        });
        survivors.set(String(preferred.id), actions.at(-1)?.after ?? preferred);
      }
    }
  }

  for (const row of normalizedRows) {
    if (deleteIds.has(String(row.id))) {
      continue;
    }

    const after = survivors.get(String(row.id)) ?? row;
    const before = rows.find((original) => original.id === row.id) ?? row;
    const changed = JSON.stringify(before) !== JSON.stringify(after);

    if (!changed) {
      actions.push({
        action: "keep",
        reason: "Already normalized.",
        before,
        after,
      });
      continue;
    }

    if (!actions.some((action) => action.after?.id === after.id && action.action === "update")) {
      actions.push({
        action: "update",
        reason: "Normalized canonical festival identity and recognition model.",
        before,
        after,
      });
    }
  }

  const finalRows = normalizedRows
    .filter((row) => !deleteIds.has(String(row.id)))
    .map((row) => survivors.get(String(row.id)) ?? row);

  return {
    actions,
    deleteIds: [...deleteIds],
    finalRows,
  };
}

/**
 * @param {RecognitionRow[]} beforeRows
 * @param {RecognitionRow[]} afterRows
 */
export function buildBeforeAfterReport(beforeRows, afterRows, actions) {
  return {
    beforeCount: beforeRows.length,
    afterCount: afterRows.length,
    deletedCount: actions.filter((action) => action.action === "delete").length,
    updatedCount: actions.filter((action) => action.action === "update").length,
    rows: afterRows.map((after) => {
      const before = beforeRows.find((row) => row.id === after.id);
      return {
        id: after.id,
        film_id: after.film_id,
        before: before
          ? {
              festival_name: before.festival_name,
              festival_year: before.festival_year ?? null,
              recognition_type: before.recognition_type,
              award_name: before.award_name ?? null,
              confidence_status: before.confidence_status ?? null,
            }
          : null,
        after: {
          canonical_festival_name: after.canonical_festival_name,
          source_display_name: after.source_display_name,
          festival_year: after.festival_year ?? null,
          recognition_type: after.recognition_type,
          award_name: after.award_name ?? null,
          award_result: after.award_result ?? null,
          confidence_status: after.confidence_status,
        },
      };
    }),
    deletions: actions
      .filter((action) => action.action === "delete")
      .map((action) => ({
        id: action.before.id,
        reason: action.reason,
        merge_target_id: action.merge_target_id ?? null,
        festival_name: action.before.festival_name,
        festival_year: action.before.festival_year ?? null,
      })),
  };
}
