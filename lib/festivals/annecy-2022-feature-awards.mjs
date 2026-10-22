/**
 * Annecy 2022 Feature Films awards — Resonale editorial page.
 * Titles must match hosted `films.title` exactly.
 * Source: https://www.annecyfestival.com/about/archives/2022/award-winners
 */

/** @type {import("../guides/resolve-guide-films.mjs").GuidePageContent} */
export const ANNECY_2022_FEATURE_AWARDS = {
  slug: "annecy",
  h1: "Annecy Festival Winners 2022",
  documentTitle: "Annecy Festival Winners 2022 | Feature Films",
  metaDescription:
    "Annecy animation festival feature film winners 2022 — Cristal, Jury, Contrechamp, and Jury Distinctions.",
  intro: [
    "Feature film winners from the Annecy animation festival 2022 — official competition and Contrechamp.",
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
      href: "/festivals/2026/annecy",
      label: "Annecy Festival Winners 2026",
    },
  ],
  groups: [
    {
      heading: "Official competition",
      description:
        "The main feature competition — Cristal, Jury Award, Jury Distinctions, and distribution.",
      films: [
        {
          title: "Little Nicholas: Happy as Can Be",
          note: "Cristal for a Feature Film",
        },
        {
          title: "No Dogs or Italians Allowed",
          note: "Jury Award · Gan Foundation Award for Distribution",
        },
        {
          title: "My Love Affair with Marriage",
          note: "Jury Distinction",
        },
        {
          title: "Blind Willow, Sleeping Woman",
          note: "Jury Distinction",
        },
      ],
    },
    {
      heading: "Contrechamp",
      description:
        "Annecy’s Contrechamp sidebar for edgier and newer feature voices.",
      films: [
        {
          title: "Dozens of Norths",
          note: "Contrechamp Award",
        },
        {
          title: "Chun Tae-il: A Flame That Lives On",
          note: "Contrechamp Jury Distinction",
        },
      ],
    },
  ],
};
