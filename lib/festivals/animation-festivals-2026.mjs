/**
 * 2026 edition metadata for Resonale animation major festivals.
 * Festival ids match `RESONALE_MAJOR_FESTIVALS` (group: animation).
 * Array order is editorial: most mass / significant first.
 * Dates are local festival days (no timezone); ISO YYYY-MM-DD.
 */

/**
 * @typedef {{
 *   festivalId: string,
 *   name: string,
 *   country: string,
 *   city: string,
 *   url: string,
 *   description: string,
 *   startDate: string | null,
 *   endDate: string | null,
 *   dateNote?: string,
 * }} AnimationFestivalEdition2026
 */

/** @type {readonly AnimationFestivalEdition2026[]} */
export const ANIMATION_FESTIVALS_2026 = Object.freeze([
  {
    festivalId: "annecy",
    name: "Annecy International Animation Film Festival",
    country: "France",
    city: "Annecy",
    url: "https://www.annecyfestival.com/en/",
    description:
      "The world’s leading animation festival and market (Mifa): features and shorts in competition, special programmes, and the industry week that defines the animation calendar.",
    startDate: "2026-06-21",
    endDate: "2026-06-27",
  },
  {
    festivalId: "ottawa",
    name: "Ottawa International Animation Festival",
    country: "Canada",
    city: "Ottawa",
    url: "https://www.animationfestival.ca/",
    description:
      "North America’s landmark animation festival — competitions, Animation Exposé, workshops, and parties — marking its 50th anniversary in 2026.",
    startDate: "2026-09-23",
    endDate: "2026-09-27",
  },
  {
    festivalId: "animafest-zagreb",
    name: "Animafest Zagreb",
    country: "Croatia",
    city: "Zagreb",
    url: "https://www.animafest.hr/en/",
    description:
      "World Festival of Animated Film in Zagreb: short and feature competitions, student and national strands, plus Animafest PRO, Scanner, and retrospectives.",
    startDate: "2026-06-08",
    endDate: "2026-06-13",
  },
  {
    festivalId: "itfs-stuttgart",
    name: "Stuttgart International Festival of Animated Film (ITFS)",
    country: "Germany",
    city: "Stuttgart",
    url: "https://itfs.de/en/",
    description:
      "One of Europe’s major animation weeks in Stuttgart’s city-centre cinemas: international competitions, Young ITFS, open-air screenings, and industry events alongside Animation Production Days.",
    startDate: "2026-05-05",
    endDate: "2026-05-10",
  },
  {
    festivalId: "hiroshima",
    name: "Hiroshima Animation Season",
    country: "Japan",
    city: "Hiroshima",
    url: "https://animation.hiroshimafest.org/en/",
    description:
      "Biennial Academy Award–qualifying animation festival in Hiroshima — competition, awards for the Pan-Pacific and Asia region, and education programmes. Successor to the historic Hiroshima International Animation Festival.",
    startDate: "2026-08-19",
    endDate: "2026-08-23",
  },
  {
    festivalId: "anima-brussels",
    name: "Anima Brussels",
    country: "Belgium",
    city: "Brussels",
    url: "https://animafestival.be/en/",
    description:
      "Brussels’ international animation festival: features and shorts in competition, retrospectives, and programmes for all ages across Flagey and other city venues.",
    startDate: "2026-02-20",
    endDate: "2026-03-01",
  },
  {
    festivalId: "fantoche",
    name: "Fantoche",
    country: "Switzerland",
    city: "Baden",
    url: "https://fantoche.ch/en/",
    description:
      "Switzerland’s largest animation festival in Baden: international shorts and features, exhibitions, and industry talks with a focus on independent artistic animation.",
    startDate: "2026-09-01",
    endDate: "2026-09-06",
  },
  {
    festivalId: "cinanima",
    name: "CINANIMA",
    country: "Portugal",
    city: "Espinho",
    url: "https://cinanima.pt/en/",
    description:
      "International Animated Film Festival of Espinho — Academy Award– and Canadian Screen Award–qualifying — celebrating its 50th edition with an extended 17-day programme.",
    startDate: "2026-11-06",
    endDate: "2026-11-22",
  },
  {
    festivalId: "anifilm",
    name: "Anifilm",
    country: "Czech Republic",
    city: "Liberec",
    url: "https://www.anifilm.cz/en/",
    description:
      "International festival of animated films in Liberec — features, shorts, games, and VR — with a strong Czech Horizon strand and Oscar-qualifying short categories.",
    startDate: "2026-05-05",
    endDate: "2026-05-10",
  },
  {
    festivalId: "kaboom",
    name: "Kaboom Animation Festival",
    country: "Netherlands",
    city: "Utrecht & Amsterdam",
    url: "https://www.kaboomfestival.nl/",
    description:
      "Dutch animation festival split between Utrecht and Amsterdam (plus a geoblocked online hub), with industry days and a bold shorts-and-features programme.",
    startDate: "2026-03-13",
    endDate: "2026-03-22",
  },
]);

export const ANIMATION_FESTIVALS_2026_YEAR = 2026;

/**
 * Editorial order: most mass / significant first (array order).
 * @returns {AnimationFestivalEdition2026[]}
 */
export function listAnimationFestivals2026() {
  return [...ANIMATION_FESTIVALS_2026];
}

/**
 * @param {string | null | undefined} startDate
 * @param {string | null | undefined} endDate
 * @param {string | null | undefined} dateNote
 * @returns {string}
 */
export function formatFestivalEditionDates(startDate, endDate, dateNote) {
  if (dateNote && (!startDate || !endDate)) return dateNote;
  if (!startDate || !endDate) return "Dates TBA";

  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return dateNote || "Dates TBA";

  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const dayOnly = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "UTC",
  });
  const full = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  if (startDate === endDate) {
    return full.format(start);
  }

  if (sameMonth) {
    return `${monthDay.format(start)}–${dayOnly.format(end)}, ${end.getUTCFullYear()}`;
  }

  if (sameYear) {
    return `${monthDay.format(start)} – ${monthDay.format(end)}, ${end.getUTCFullYear()}`;
  }

  return `${full.format(start)} – ${full.format(end)}`;
}

/**
 * @param {string} iso
 * @returns {Date | null}
 */
function parseIsoDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
