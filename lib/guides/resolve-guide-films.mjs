/**
 * Resolve editorial guide titles against live catalog rows.
 * Order is always the editorial order — never personalized.
 *
 * Short entries (`kind: "short"`) stay out of the catalog: they resolve
 * in-place with an external watch URL and never hit Supabase.
 */

/**
 * @typedef {{ title: string, note?: string, awards?: string, kind?: "catalog" }} GuideCatalogFilmEntry
 * @typedef {{
 *   kind: "short",
 *   title: string,
 *   year: number,
 *   runtimeLabel: string,
 *   watchUrl: string,
 *   trailerUrl?: string,
 *   country?: string,
 *   director?: string,
 *   posterUrl?: string,
 *   note?: string,
 * }} GuideShortFilmEntry
 * @typedef {{ kind: "prose", text: string }} GuideProseEntry
 * @typedef {{
 *   kind: "guidePreview",
 *   href: string,
 *   label: string,
 *   blurb?: string,
 *   titles: string[],
 * }} GuideGuidePreviewEntry
 * @typedef {GuideCatalogFilmEntry | GuideShortFilmEntry | GuideProseEntry | GuideGuidePreviewEntry} GuideFilmEntry
 * @typedef {{ heading: string, description?: string, films: GuideFilmEntry[] }} GuideGroup
 * @typedef {{
 *   src: string,
 *   alt: string,
 *   credit?: string,
 *   creditHref?: string,
 * }} GuidePortrait
 * @typedef {{
 *   slug: string,
 *   h1: string,
 *   documentTitle?: string,
 *   metaDescription?: string,
 *   intro: string[],
 *   personalNote: string,
 *   cta: { href: string, label: string },
 *   relatedGuides?: { href: string, label: string }[],
 *   anchorTitle?: string,
 *   portrait?: GuidePortrait,
 *   collageUnderlay?: { src: string, title: string },
 *   collageSize?: "default" | "compact",
 *   hideFilmCardFestivalBadges?: boolean,
 *   groups: GuideGroup[],
 * }} GuidePageContent
 * @typedef {{ id: string, title: string, poster_url?: string | null, image_url?: string | null }} GuideFilmLike
 * @typedef {{
 *   kind: "catalog",
 *   film: GuideFilmLike,
 *   note: string | null,
 *   awards: string | null,
 * }} GuideResolvedCatalogItem
 * @typedef {{
 *   kind: "short",
 *   title: string,
 *   year: number,
 *   runtimeLabel: string,
 *   watchUrl: string,
 *   trailerUrl: string | null,
 *   country: string | null,
 *   director: string | null,
 *   posterUrl: string | null,
 *   note: string | null,
 * }} GuideResolvedShortItem
 * @typedef {{ kind: "prose", text: string }} GuideResolvedProseItem
 * @typedef {{
 *   kind: "guidePreview",
 *   href: string,
 *   label: string,
 *   blurb: string | null,
 *   posters: { title: string, posterUrl: string | null }[],
 * }} GuideResolvedGuidePreviewItem
 * @typedef {GuideResolvedCatalogItem | GuideResolvedShortItem | GuideResolvedProseItem | GuideResolvedGuidePreviewItem} GuideResolvedItem
 */

/**
 * @param {GuideFilmEntry | null | undefined} entry
 * @returns {entry is GuideShortFilmEntry}
 */
export function isGuideShortFilmEntry(entry) {
  return entry?.kind === "short";
}

/**
 * @param {GuideFilmEntry | null | undefined} entry
 * @returns {entry is GuideProseEntry}
 */
export function isGuideProseEntry(entry) {
  return entry?.kind === "prose";
}

/**
 * @param {GuideFilmEntry | null | undefined} entry
 * @returns {entry is GuideGuidePreviewEntry}
 */
export function isGuideGuidePreviewEntry(entry) {
  return entry?.kind === "guidePreview";
}

/**
 * Catalog titles only — used for catalog deep-links / uniqueness.
 * Excludes shorts, prose, and cross-guide poster previews.
 *
 * @param {GuidePageContent} guide
 * @returns {string[]}
 */
export function listGuideFilmTitles(guide) {
  return (guide?.groups ?? []).flatMap((group) =>
    (group.films ?? [])
      .filter(
        (entry) =>
          !isGuideShortFilmEntry(entry) &&
          !isGuideProseEntry(entry) &&
          !isGuideGuidePreviewEntry(entry)
      )
      .map((entry) => entry.title)
  );
}

/**
 * Titles needed only for cross-guide poster strips (not editorial list items).
 *
 * @param {GuidePageContent} guide
 * @returns {string[]}
 */
export function listGuidePreviewTitles(guide) {
  return (guide?.groups ?? []).flatMap((group) =>
    (group.films ?? [])
      .filter((entry) => isGuideGuidePreviewEntry(entry))
      .flatMap((entry) =>
        (entry.titles ?? [])
          .map((title) => String(title ?? "").trim())
          .filter(Boolean)
      )
  );
}

/**
 * All listed titles (catalog + shorts) for JSON-LD ItemList.
 * Preview strips are teasers for another guide — excluded.
 *
 * @param {GuidePageContent} guide
 * @returns {string[]}
 */
export function listGuideItemListTitles(guide) {
  return (guide?.groups ?? []).flatMap((group) =>
    (group.films ?? [])
      .filter(
        (entry) => !isGuideProseEntry(entry) && !isGuideGuidePreviewEntry(entry)
      )
      .map((entry) => entry.title)
  );
}

/**
 * @param {GuideShortFilmEntry} entry
 * @returns {GuideResolvedShortItem | null}
 */
function resolveShortFilmEntry(entry) {
  const title = String(entry?.title ?? "").trim();
  const watchUrl = String(entry?.watchUrl ?? "").trim();
  const runtimeLabel = String(entry?.runtimeLabel ?? "").trim();
  const year = Number(entry?.year);
  if (!title || !watchUrl || !runtimeLabel || !Number.isFinite(year)) {
    return null;
  }

  const note = String(entry?.note ?? "").trim();
  const posterUrl = String(entry?.posterUrl ?? "").trim();
  const trailerUrl = String(entry?.trailerUrl ?? "").trim();
  const country = String(entry?.country ?? "").trim();
  const director = String(entry?.director ?? "").trim();
  return {
    kind: "short",
    title,
    year,
    runtimeLabel,
    watchUrl,
    trailerUrl: trailerUrl || null,
    country: country || null,
    director: director || null,
    posterUrl: posterUrl || null,
    note: note || null,
  };
}

/**
 * @template {GuideFilmLike} T
 * @param {GuidePageContent} guide
 * @param {T[]} films
 * @returns {{
 *   groups: { heading: string, description: string, items: GuideResolvedItem[] }[],
 *   missingTitles: string[],
 * }}
 */
export function resolveGuideFilms(guide, films) {
  const byTitle = new Map();
  for (const film of films ?? []) {
    if (film?.title && !byTitle.has(film.title)) {
      byTitle.set(film.title, film);
    }
  }

  /** @type {string[]} */
  const missingTitles = [];
  /** @type {{ heading: string, description: string, items: GuideResolvedItem[] }[]} */
  const groups = [];

  for (const group of guide?.groups ?? []) {
    /** @type {GuideResolvedItem[]} */
    const items = [];
    for (const entry of group.films ?? []) {
      if (isGuideProseEntry(entry)) {
        const text = String(entry?.text ?? "").trim();
        if (!text) {
          continue;
        }
        items.push({ kind: "prose", text });
        continue;
      }

      if (isGuideShortFilmEntry(entry)) {
        const short = resolveShortFilmEntry(entry);
        if (!short) {
          missingTitles.push(String(entry?.title ?? "short").trim() || "short");
          continue;
        }
        items.push(short);
        continue;
      }

      if (isGuideGuidePreviewEntry(entry)) {
        const href = String(entry?.href ?? "").trim();
        const label = String(entry?.label ?? "").trim();
        const titles = (entry?.titles ?? [])
          .map((title) => String(title ?? "").trim())
          .filter(Boolean);
        if (!href || !label || titles.length === 0) {
          missingTitles.push(label || href || "guidePreview");
          continue;
        }

        /** @type {{ title: string, posterUrl: string | null }[]} */
        const posters = [];
        let previewMissing = false;
        for (const title of titles) {
          const film = byTitle.get(title);
          if (!film) {
            missingTitles.push(title);
            previewMissing = true;
            continue;
          }
          const posterUrl =
            String(film.poster_url ?? "").trim() ||
            String(film.image_url ?? "").trim() ||
            null;
          posters.push({ title, posterUrl });
        }
        if (previewMissing) {
          continue;
        }

        const blurb = String(entry?.blurb ?? "").trim();
        items.push({
          kind: "guidePreview",
          href,
          label,
          blurb: blurb || null,
          posters,
        });
        continue;
      }

      const film = byTitle.get(entry.title);
      if (!film) {
        missingTitles.push(entry.title);
        continue;
      }
      const note = String(entry.note ?? "").trim();
      const awards = String(entry.awards ?? "").trim();
      items.push({
        kind: "catalog",
        film,
        note: note || null,
        awards: awards || null,
      });
    }
    groups.push({
      heading: group.heading,
      description: group.description ?? "",
      items,
    });
  }

  if (missingTitles.length > 0) {
    return { groups: [], missingTitles };
  }

  return { groups, missingTitles };
}

/**
 * Exact title match only — never substitute a nearby film.
 *
 * @template {GuideFilmLike} T
 * @param {T[]} films
 * @param {string | null | undefined} title
 * @returns {T | null}
 */
export function findGuideFilmByTitle(films, title) {
  const exact = String(title ?? "").trim();
  if (!exact) {
    return null;
  }

  return (films ?? []).find((film) => film?.title === exact) ?? null;
}

/**
 * Resolve the guide's reference film (exact title). Missing is allowed:
 * the page still renders, without a hero poster.
 *
 * @template {GuideFilmLike} T
 * @param {GuidePageContent} guide
 * @param {T[]} films
 * @returns {T | null}
 */
export function resolveGuideAnchorFilm(guide, films) {
  return findGuideFilmByTitle(films, guide?.anchorTitle);
}
