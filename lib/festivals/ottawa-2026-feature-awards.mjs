/**
 * Ottawa 2026 Animated Feature awards — Resonale editorial page.
 * Titles must match hosted `films.title` exactly.
 * Source: https://www.animationfestival.ca/festival/screenings/#winners
 */

/** @type {import("../guides/resolve-guide-films.mjs").GuidePageContent} */
export const OTTAWA_2026_FEATURE_AWARDS = {
  slug: "ottawa",
  h1: "Ottawa Festival Winners 2026",
  documentTitle: "Ottawa Festival Winners 2026 | Feature Films",
  metaDescription:
    "Ottawa International Animation Festival feature film winners 2026 — Grand Prize and honourable mentions.",
  intro: [
    "Feature film winners from the Ottawa International Animation Festival 2026 — Grand Prize and jury honourable mentions.",
  ],
  personalNote:
    "These are the feature titles Resonale tracks from Ottawa’s main feature awards. Open any film for mood, technique, and where it sits in the catalog.",
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
  ],
  groups: [
    {
      heading: "Animated Feature Competition",
      description:
        "OIAF’s feature competition — Grand Prize and jury honourable mentions.",
      films: [
        {
          title: "We Are Aliens",
          note: "Grand Prize for Animated Feature",
        },
        {
          title: "Magic Atlas",
          note: "Honourable Mention",
        },
        {
          title: "Tangles",
          note: "Honourable Mention",
        },
      ],
    },
  ],
};
