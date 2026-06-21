/**
 * Known festival official sources for one-time backfill verification.
 * archiveUrlTemplates receive festival_year and return page URLs to fetch (not search snippets).
 */

/**
 * @typedef {{
 *   id: string,
 *   names: RegExp[],
 *   domains: string[],
 *   primaryDomain: string,
 *   archiveUrlTemplates: ((year: number | null) => string[])[],
 *   searchQueries: ((filmTitle: string, year: number | null) => string)[],
 * }} FestivalOfficialSource
 */

/** @type {FestivalOfficialSource[]} */
export const FESTIVAL_OFFICIAL_SOURCES = [
  {
    id: "annecy",
    names: [/annecy/i],
    domains: ["annecyfestival.com", "annecy.org"],
    primaryDomain: "annecyfestival.com",
    archiveUrlTemplates: [
      (year) =>
        year
          ? [
              `https://www.annecyfestival.com/about/archives:en/${year}:en/award-winners`,
              `https://www.annecy.org/about/archives/${year}/official-selection:lm`,
              `https://www.annecy.org/about/archives/${year}/official-selection:lmcc`,
              `https://www.annecyfestival.com/about/archives:en/${year}:en/feature-films-in-competition`,
            ]
          : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:annecyfestival.com OR site:annecy.org "${title}"${year ? ` ${year}` : ""} award OR competition`,
    ],
  },
  {
    id: "berlinale",
    names: [/berlinale|berlin international/i],
    domains: ["berlinale.de"],
    primaryDomain: "berlinale.de",
    archiveUrlTemplates: [
      (year) =>
        year
          ? [
              `https://www.berlinale.de/en/${year}/programme/`,
              `https://www.berlinale.de/en/archive/yearbooks/${year}.html`,
              `https://www.berlinale.de/en/${year}/news-press-releases/102216.html`,
            ]
          : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:berlinale.de "${title}"${year ? ` ${year}` : ""} programme OR competition`,
    ],
  },
  {
    id: "cannes",
    names: [/cannes|quinzaine|directors' fortnight/i],
    domains: ["festival-cannes.com", "quinzaine-realisateurs.com"],
    primaryDomain: "festival-cannes.com",
    archiveUrlTemplates: [
      (year) =>
        year
          ? [
              `https://www.festival-cannes.com/en/press/press-releases/edition/${year}`,
              `https://www.quinzaine-realisateurs.com/en/edition/${year}`,
            ]
          : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:festival-cannes.com OR site:quinzaine-realisateurs.com "${title}"${year ? ` ${year}` : ""}`,
    ],
  },
  {
    id: "venice",
    names: [/venice|biennale|mostra/i],
    domains: ["labiennale.org", "lavenezia.org"],
    primaryDomain: "labiennale.org",
    archiveUrlTemplates: [
      (year) =>
        year
          ? [
              `https://www.labiennale.org/en/cinema/${year}`,
              `https://www.labiennale.org/en/cinema/archive/${year}`,
            ]
          : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:labiennale.org "${title}"${year ? ` ${year}` : ""} venice OR mostra`,
    ],
  },
  {
    id: "sundance",
    names: [/sundance/i],
    domains: ["sundance.org", "festival.sundance.org"],
    primaryDomain: "festival.sundance.org",
    archiveUrlTemplates: [
      (year) =>
        year
          ? [`https://festival.sundance.org/program/films/${year}`]
          : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:festival.sundance.org OR site:sundance.org "${title}"${year ? ` ${year}` : ""}`,
    ],
  },
  {
    id: "ottawa",
    names: [/ottawa/i],
    domains: ["animationfestival.ca"],
    primaryDomain: "animationfestival.ca",
    archiveUrlTemplates: [
      (year) =>
        year
          ? [
              `https://www.animationfestival.ca/festival/${year}`,
              `https://www.animationfestival.ca/award-winners/${year}`,
            ]
          : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:animationfestival.ca "${title}"${year ? ` ${year}` : ""}`,
    ],
  },
  {
    id: "hiroshima",
    names: [/hiroshima/i],
    domains: ["hiroshima-anim.jp"],
    primaryDomain: "hiroshima-anim.jp",
    archiveUrlTemplates: [
      (year) =>
        year ? [`https://www.hiroshima-anim.jp/en/archive/${year}/`] : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:hiroshima-anim.jp "${title}"${year ? ` ${year}` : ""}`,
    ],
  },
  {
    id: "animafest",
    names: [/animafest|zagreb/i],
    domains: ["animafest.hr"],
    primaryDomain: "animafest.hr",
    archiveUrlTemplates: [
      (year) =>
        year ? [`https://www.animafest.hr/en/archive/${year}`] : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:animafest.hr "${title}"${year ? ` ${year}` : ""}`,
    ],
  },
  {
    id: "stuttgart",
    names: [/stuttgart|itfs/i],
    domains: ["itfs.de"],
    primaryDomain: "itfs.de",
    archiveUrlTemplates: [
      (year) => (year ? [`https://www.itfs.de/en/archive/${year}`] : []),
    ],
    searchQueries: [
      (title, year) => `site:itfs.de "${title}"${year ? ` ${year}` : ""}`,
    ],
  },
  {
    id: "bfi_london",
    names: [/bfi london|london film festival/i],
    domains: ["whatson.bfi.org.uk", "bfi.org.uk"],
    primaryDomain: "whatson.bfi.org.uk",
    archiveUrlTemplates: [
      (year) =>
        year
          ? [
              `https://whatson.bfi.org.uk/londonfilmfestival/${year}`,
              `https://www.bfi.org.uk/london-film-festival/${year}`,
            ]
          : [],
    ],
    searchQueries: [
      (title, year) =>
        `site:whatson.bfi.org.uk OR site:bfi.org.uk "${title}"${year ? ` ${year}` : ""} london film festival`,
    ],
  },
];

/**
 * @param {string | null | undefined} festivalName
 * @returns {FestivalOfficialSource | null}
 */
export function matchFestivalOfficialSource(festivalName) {
  const normalized = String(festivalName ?? "").trim();
  if (!normalized) {
    return null;
  }

  return (
    FESTIVAL_OFFICIAL_SOURCES.find((source) =>
      source.names.some((pattern) => pattern.test(normalized))
    ) ?? null
  );
}

/**
 * @param {string | null | undefined} festivalName
 * @returns {boolean}
 */
export function isConfiguredFestival(festivalName) {
  return matchFestivalOfficialSource(festivalName) != null;
}

/**
 * @param {FestivalOfficialSource} source
 * @param {number | null | undefined} festivalYear
 */
export function buildOfficialArchiveUrls(source, festivalYear) {
  const year =
    typeof festivalYear === "number" && Number.isInteger(festivalYear)
      ? festivalYear
      : null;

  const urls = source.archiveUrlTemplates.flatMap((template) => template(year));
  return [...new Set(urls)];
}

/**
 * @param {FestivalOfficialSource} source
 * @param {string} filmTitle
 * @param {number | null | undefined} festivalYear
 */
export function buildOfficialSearchQueries(source, filmTitle, festivalYear) {
  const year =
    typeof festivalYear === "number" && Number.isInteger(festivalYear)
      ? festivalYear
      : null;

  return source.searchQueries.map((builder) => builder(filmTitle, year));
}

/**
 * @param {string} url
 * @param {FestivalOfficialSource} source
 */
export function isOfficialSourceUrl(url, source) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return source.domains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} href
 * @param {string} pageUrl
 */
export function resolveOfficialHref(href, pageUrl) {
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return null;
  }
}
