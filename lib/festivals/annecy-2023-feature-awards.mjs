/**
 * Annecy 2023 Feature Films awards — Resonale editorial page.
 * Titles must match hosted `films.title` exactly.
 * Source: https://www.annecyfestival.com/about/archives/2023/award-winners
 */

/** @type {import("../guides/resolve-guide-films.mjs").GuidePageContent} */
export const ANNECY_2023_FEATURE_AWARDS = {
  slug: "annecy",
  h1: "Annecy Festival Winners 2023",
  documentTitle: "Annecy Festival Winners 2023 | Feature Films",
  metaDescription:
    "Annecy animation festival feature film winners 2023 — Cristal, Jury, Contrechamp, and Audience awards.",
  intro: [
    "Feature film winners from the Annecy animation festival 2023 — official competition and Contrechamp.",
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
        "The main feature competition — Cristal, Jury, Audience, distribution, and the Paul Grimault Award.",
      films: [
        {
          title: "Chicken for Linda!",
          note: "Cristal for a Feature Film · Gan Foundation Award for Distribution",
        },
        {
          title: "Four Souls of Coyote",
          note: "Jury Award",
        },
        {
          title: "Sirocco and the Kingdom of the Winds",
          note: "Audience Award",
        },
        {
          title: "The Tunnel to Summer, the Exit of Goodbyes",
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
          title: "Robot Dreams",
          note: "Contrechamp Grand Prix",
        },
        {
          title: "Tony, Shelly and the Magic Light",
          note: "Contrechamp Jury Award",
        },
      ],
    },
  ],
};
