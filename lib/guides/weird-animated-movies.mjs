/** @type {import("./resolve-guide-films.mjs").GuidePageContent} */
export const WEIRD_ANIMATED_MOVIES_GUIDE = {
  slug: "weird-animated-movies",
  h1: "Weird Animated Movies: Strange Films You Probably Haven’t Seen",
  metaDescription:
    "Weird animated movies worth discovering: strange independent and festival films where the world, the story, or familiar things refuse to behave.",
  intro: [
    "Sometimes we want something stranger than the usual recommendations — a film that feels a little unsettling, absurd, dreamlike, or simply unlike anything I’ve seen before. The problem is that “weird animation” is not a very precise category, and it is surprisingly hard to search for.",
    "So this guide brings together nine unusual animated films that are strange in different ways: some build worlds with completely unfamiliar rules, some follow dream logic, and some make ordinary places and objects feel just slightly wrong.",
  ],
  personalNote:
    "If you love something very specific but can’t quite name what it is — or figure out how to find more of it — that feeling is very familiar to me. That’s why I built Resonale: to make unusual independent and festival animation easier to discover, even when you don’t yet have the right words for what you’re looking for.",
  cta: {
    href: "/",
    label: "Explore more animation in Resonale",
  },
  relatedGuides: [
    {
      href: "/guides/beautiful-animated-films",
      label: "Beautiful animated films",
    },
    {
      href: "/guides/films-like-flow",
      label: "9 Movies Like Flow",
    },
    {
      href: "/guides/non-disney-animated-movies",
      label: "Non-Disney animated movies",
    },
  ],
  groups: [
    {
      heading: "When the world makes no normal sense",
      description:
        "These films take place in worlds that are fundamentally unlike ours — underground societies, mythical creatures, folk-tale universes. Their strangeness comes from accepting impossible beings and unfamiliar rules as completely normal.",
      films: [
        { title: "Junk Head" },
        { title: "Cryptozoo" },
        { title: "Son of the White Mare" },
      ],
    },
    {
      heading: "When the story runs on dream logic",
      description:
        "These films move by association, transformation, and sudden shifts rather than by a neat sequence of events. Mind Game races from one reality to another, Dozens of Norths is deliberately fragmented, and The Tune turns a simple journey into a chain of surreal encounters.",
      films: [
        { title: "Mind Game" },
        { title: "Dozens of Norths" },
        { title: "The Tune" },
      ],
    },
    {
      heading: "When everything feels slightly wrong",
      description:
        "These films begin with things we recognize — a house, a town, toys — and push them somewhere much stranger. Spaces transform, familiar stories turn grotesque, and ordinary objects start following their own absurd or unsettling logic.",
      films: [
        { title: "The Wolf House" },
        { title: "The Pied Piper" },
        { title: "A Town Called Panic" },
      ],
    },
  ],
};
