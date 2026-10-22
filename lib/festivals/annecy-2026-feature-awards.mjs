/**
 * Annecy 2026 Feature Films awards — Resonale editorial page.
 * Titles must match hosted `films.title` exactly.
 * Source: https://www.annecyfestival.com/en/the-festival/2026-awards
 */

/** @type {import("../guides/resolve-guide-films.mjs").GuidePageContent} */
export const ANNECY_2026_FEATURE_AWARDS = {
  slug: "annecy",
  h1: "Annecy Festival Winners 2026",
  documentTitle: "Annecy Festival Winners 2026 | Feature Films",
  metaDescription:
    "Annecy animation festival feature film winners 2026 — Cristal, Jury, Contrechamp, and Audience awards.",
  intro: [
    "Feature film winners from the Annecy animation festival 2026 — official competition and Contrechamp.",
  ],
  personalNote:
    "These are the feature titles Resonale tracks from Annecy’s major awards. Open any film for mood, technique, and where it sits in the catalog.",
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
      href: "/festivals/2025/annecy",
      label: "Annecy Festival Winners 2025",
    },
  ],
  groups: [
    {
      heading: "Official competition",
      description:
        "The main feature competition — Cristal, Jury, Audience, distribution, and the Paul Grimault Award.",
      films: [
        {
          title: "The Violinist",
          note: "Cristal for a Feature Film",
        },
        {
          title: "Iron Boy",
          note: "Jury Award · Audience Award · Gan Foundation Award for Distribution",
        },
        {
          title: "Decorado",
          note: "Paul Grimault Award",
        },
      ],
    },
    {
      heading: "Contrechamp",
      description:
        "Annecy’s Contrechamp sidebar for edgier and newer feature voices.",
      films: [
        {
          title: "Blaise",
          note: "Contrechamp Grand Prix",
        },
        {
          title: "A New Dawn",
          note: "Contrechamp Jury Award",
        },
      ],
    },
  ],
};
