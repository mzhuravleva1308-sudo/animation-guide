/**
 * Exact hosted title: Dandelion’s Odyssey uses U+2019.
 *
 * Research-driven film swaps vs first mapping:
 * - Digital 2D: Pachamama removed (3D characters / 2D backgrounds per director).
 *   Endless Cookie added (Flash / Animate 2D).
 * - Cut-out / silhouette: Tales of the Night removed (CGI silhouette per Ocelot).
 *   Princes and Princesses added (paper cut-out silhouettes).
 *
 * @type {import("./resolve-guide-films.mjs").GuidePageContent}
 */
export const ANIMATION_STYLES_GUIDE = {
  slug: "animation-styles",
  h1: "Animation Styles: A Visual Guide to Different Types of Animation",
  documentTitle: "Animation Styles: A Visual Guide to Different Types",
  metaDescription:
    "Explore different animation styles, from hand-drawn 2D and stop motion to rotoscoping, experimental animation, painterly and watercolor styles, with film examples.",
  intro: [
    "Animation styles are often easier to feel than to name. You might love the tremor of a pencil line, the weight of clay, or a world that looks washed in pigment — without knowing which type of animation you are actually looking at.",
    "This is a visual guide to different types of animation styles. We’ll start with how animated films are made — from hand-drawn 2D and stop motion to rotoscoping and 3D — and then look at a few visual styles, like painterly and watercolor animation.",
    "The films here are not meant as a definitive list. They are examples that make each style easier to see. And if you notice yourself returning to the same kinds of lines, textures, materials, or colors, that can be a surprisingly useful way to find what to watch next.",
  ],
  personalNote:
    "If different animation styles feel hard to browse — not by studio, but by how a film is drawn, built, cut, or painted — I know the feeling. That’s why I built Resonale: to gather independent and festival animation and make it easier to find more of the visual styles you love.",
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
      href: "/guides/weird-animated-movies",
      label: "Weird animated movies",
    },
  ],
  groups: [
    {
      heading: "Hand-drawn and traditional 2D animation",
      description:
        "Hand-drawn animation starts as a drawing: pencil, ink, paper, historically transferred onto clear cels and photographed over a painted background. Traditional 2D is that older production line — drawings made to be shot, one frame after another. The movement lives in the line. You often notice pressure, tremor, and the slightly unstable edge of a figure, because a hand had to put that edge there. Today the drawings may be scanned and colored on a computer. That does not automatically make the film “digital 2D”: what matters is that the movement is still created by drawing each frame.",
      films: [{ title: "Josep" }, { title: "The Illusionist" }],
    },
    {
      heading: "Digital 2D",
      description:
        "Digital 2D is made directly on a computer, rather than starting with drawings on paper. Artists can draw with a tablet, move separate parts of a character, and color everything digitally.\n\nVisually, digital 2D can still look handmade. Many 2D animation movies use this method and still read as drawn, even though the artwork is created and assembled digitally. The difference is mostly in how the animation is made, not in how polished or rough it looks.",
      films: [{ title: "Endless Cookie" }, { title: "Tekkonkinkreet" }],
    },
    {
      heading: "3D animation",
      description:
        "3D animation is created with digital models rather than flat drawings. Characters and objects are built in three dimensions, so the camera can move around them and through the space they inhabit. The final look can be realistic, graphic, soft, or highly stylized — 3D describes how the film is made, not how it has to look.",
      films: [{ title: "True North" }],
    },
    {
      heading: "Stop motion",
      description:
        "Stop motion is made by moving physical objects a little at a time and photographing each change. The objects can be puppets, clay figures, paper, fabric, or almost anything else. Because the materials are real, stop-motion films often keep a very tangible quality — you can see the texture of clay, fabric, wood, and miniature sets.",
      films: [
        { title: "Memoir of a Snail" },
        { title: "No Dogs or Italians Allowed" },
      ],
    },
    {
      heading: "Rotoscoping",
      description:
        "Rotoscoping is animation made from real filmed movement. Actors are filmed first, and animators then draw over the video frame by frame. Max Fleischer developed the technique in the 1910s to make animated movement look more lifelike. That is why rotoscoped characters often move with an unusual sense of realism, even when the final image is highly stylized.",
      films: [
        { title: "Alois Nebel" },
        { title: "The Case of Hana & Alice" },
      ],
    },
    {
      heading: "Cut-out and silhouette",
      description:
        "Cut-out animation is made by moving flat pieces of paper, card, or other materials frame by frame instead of redrawing the character each time. Silhouette animation is a related technique that uses dark cut-out figures against a light background, almost like shadow theatre. One of its pioneers, Lotte Reiniger, animated jointed paper figures on a glass table in the early 20th century. The result often has a very graphic, layered look because the characters are built from flat shapes rather than drawn as three-dimensional forms.",
      films: [
        { title: "Fantastic Planet" },
        { title: "Princes and Princesses" },
      ],
    },
    {
      heading: "Collage and mixed media",
      description:
        "Collage animation combines different visual materials, such as cut paper, photographs, text, or found images. Mixed-media animation is broader: it uses more than one technique or material in the same film, for example drawing together with photography, paint, or physical sets. The two can overlap, but collage is specifically about assembling different visual elements, while mixed media can combine almost any animation methods.",
      films: [
        { title: "Sita Sings the Blues" },
        { title: "Rocks in My Pockets" },
      ],
    },
    {
      heading: "Experimental animation",
      description:
        "Experimental animation is not one specific technique or visual style. It is a broad approach that gives artists more freedom to play with materials, movement, editing, and storytelling. Some experimental films are abstract, others still tell a clear story, but they usually break away from familiar animation conventions and use the form itself as part of the experience.",
      films: [
        { title: "It's Such a Beautiful Day" },
        { title: "Dandelion’s Odyssey" },
      ],
    },
    {
      heading: "Painterly — a visual style, not a technique",
      description:
        "The last two sections are visual art styles rather than production techniques. Painterly and watercolor approaches are common in artistic animation, where the surface of the image becomes part of the experience. Painterly animation is made to look like painting, with visible brushwork, pigment, soft edges, or surfaces that feel like canvas. That look can be created in different ways. In paint-on-glass animation, wet paint is changed directly under the camera so one image gradually becomes the next. In other films, the frames may be drawn and colored digitally to create a painted look.",
      films: [{ title: "The Crossing" }, { title: "Bombay Rose" }],
    },
    {
      heading: "Watercolor — a visual style, not a technique",
      description:
        "Watercolor is also a visual style rather than a separate production technique. Pigment looks washed, translucent, and paper-wet — whether the film was painted that way on paper or approximated as a watercolor-like digital drawing. It is one of the animation art styles people mean when they want a film that feels light, stained, and a little fragile, even when the story is not gentle. It should not be confused with paint-on-glass or with 2D animation that simply uses soft colors or painterly backgrounds.",
      films: [
        { title: "My Neighbors the Yamadas" },
        { title: "The Swallows of Kabul" },
      ],
    },
  ],
};
