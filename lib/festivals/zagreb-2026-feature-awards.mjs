/**
 * Animafest Zagreb 2026 Feature Film awards — Resonale editorial page.
 * Titles must match hosted `films.title` exactly.
 * Source: https://www.animafest.hr/en/vijesti/pobjednici-svjetskog-festivala-animiranog-filma-animafesta-zagreb-2026
 */

/** @type {import("../guides/resolve-guide-films.mjs").GuidePageContent} */
export const ZAGREB_2026_FEATURE_AWARDS = {
  slug: "zagreb",
  h1: "Animafest Zagreb Winners 2026",
  documentTitle: "Animafest Zagreb Winners 2026 | Feature Films",
  metaDescription:
    "Animafest Zagreb feature film winners 2026 — Grand Prix, Special Mention, and Audience Award.",
  intro: [
    "Feature film winners from Animafest Zagreb 2026 — Grand Prix, jury special mention, and the audience award.",
  ],
  personalNote:
    "These are the feature titles Resonale tracks from Animafest’s main feature awards. Open any film for mood, technique, and where it sits in the catalog.",
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
      heading: "Grand Competition — Feature Film",
      description:
        "Animafest’s feature competition — Grand Prix, special mention, and the Mr. M audience award.",
      films: [
        {
          title: "Death Does Not Exist",
          note: "Grand Prix — Best Feature Film",
        },
        {
          title: "Son of a Bitch",
          note: "Special Mention",
        },
        {
          title: "Samurai Ballerina",
          note: "Mr. M Audience Award for Best Feature Film",
        },
      ],
    },
  ],
};
