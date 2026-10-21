/**
 * ITFS Stuttgart 2026 AniMovie (feature) awards — Resonale editorial page.
 * Titles must match hosted `films.title` exactly.
 * Source: https://itfs.de/en/professionals_talents/winners-2026/
 */

/** @type {import("../guides/resolve-guide-films.mjs").GuidePageContent} */
export const STUTTGART_2026_FEATURE_AWARDS = {
  slug: "stuttgart",
  h1: "Stuttgart Festival Winners 2026",
  documentTitle: "Stuttgart Festival Winners 2026 | Feature Films",
  metaDescription:
    "ITFS Stuttgart AniMovie winners 2026 — Best Animated Feature Film and special mentions.",
  intro: [
    "Feature film winners from the Stuttgart International Festival of Animated Film 2026 — AniMovie Award and jury special mentions.",
  ],
  personalNote:
    "These are the feature titles Resonale tracks from ITFS’s AniMovie competition. Open any film for mood, technique, and where it sits in the catalog.",
  cta: {
    href: "/festivals/2026",
    label: "All animation festivals in 2026",
  },
  relatedGuides: [
    {
      href: "/festivals/2026",
      label: "Animation Festivals 2026",
    },
    {
      href: "/festivals/2026/annecy",
      label: "Annecy Festival Winners 2026",
    },
    {
      href: "/festivals/2026/ottawa",
      label: "Ottawa Festival Winners 2026",
    },
  ],
  groups: [
    {
      heading: "AniMovie Competition",
      description:
        "ITFS’s feature competition — Best Animated Feature Film and jury special mentions.",
      films: [
        {
          title: "A Story About Fire",
          note: "AniMovie Award — Best Animated Feature Film",
        },
        {
          title: "Little Amélie or the Character of Rain",
          note: "Special Mention",
        },
        {
          title: "Allah Is Not Obliged",
          note: "Special Mention",
        },
      ],
    },
  ],
};
