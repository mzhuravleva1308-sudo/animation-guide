/**
 * Catalog technique/style picker behind the Stop motion quick filter.
 * Matches films.technique (free text). Order follows the animation-styles guide.
 */

/**
 * @typedef {"hand-drawn" | "digital-2d" | "3d" | "stop-motion" | "rotoscope" | "cut-out" | "mixed-media" | "experimental" | "painterly" | "watercolor"} AnimationTechniqueFilterId
 */

/**
 * @typedef {{
 *   id: AnimationTechniqueFilterId,
 *   label: string,
 *   description: string,
 *   terms: readonly string[],
 * }} AnimationTechniqueFilter
 */

/**
 * @type {readonly AnimationTechniqueFilter[]}
 */
export const ANIMATION_TECHNIQUE_FILTERS = Object.freeze([
  {
    id: "hand-drawn",
    label: "Hand-drawn",
    description:
      "Films drawn by hand — pencil, paper, cels, and the slightly unstable edge of a figure.",
    terms: Object.freeze([
      "hand-drawn",
      "hand drawn",
      "traditional animation",
      "drawing on paper",
      "drawing on cels",
    ]),
  },
  {
    id: "digital-2d",
    label: "Digital 2D",
    description:
      "Flat animation made on a computer, including digital 2D and drawn 2D pipelines.",
    terms: Object.freeze([
      "2d computer",
      "digital 2d",
      "2d digital",
      "vector animation",
      "2d animation",
      "2d /",
      "/ 2d",
    ]),
  },
  {
    id: "3d",
    label: "3D",
    description: "Films built with digital models rather than flat drawings.",
    terms: Object.freeze(["3d"]),
  },
  {
    id: "stop-motion",
    label: "Stop motion",
    description:
      "Animation made with puppets, models and other physical materials.",
    terms: Object.freeze([
      "stop motion",
      "stop-motion",
      "stopmotion",
      "clay",
      "claymation",
      "plasticine",
      "puppet",
      "puppetry",
      "object animation",
      "object-animation",
    ]),
  },
  {
    id: "rotoscope",
    label: "Rotoscope",
    description: "Animation drawn over filmed movement.",
    terms: Object.freeze(["rotoscope", "rotoscoping", "rotoscoped"]),
  },
  {
    id: "cut-out",
    label: "Cut-out",
    description:
      "Cut-out and silhouette animation, made from flat shapes and layered figures.",
    terms: Object.freeze(["cut-out", "cutout", "silhouette"]),
  },
  {
    id: "mixed-media",
    label: "Mixed media",
    description:
      "Films that combine collage, mixed techniques, or more than one method.",
    terms: Object.freeze([
      "mixed techniques",
      "mixed media",
      "mixed-media",
      "mixed animation",
      "collage",
    ]),
  },
  {
    id: "experimental",
    label: "Experimental",
    description:
      "Films that play with materials, movement and form beyond familiar animation conventions.",
    terms: Object.freeze(["experimental"]),
  },
  {
    id: "painterly",
    label: "Painterly",
    description:
      "Animation that looks painted — brushwork, pigment, paint-on-glass.",
    terms: Object.freeze([
      "painted animation",
      "painted 2d",
      "paint-on-glass",
      "oil-painting",
      "oil painting",
      "digital painting",
      "painterly",
      "loose brushwork",
    ]),
  },
  {
    id: "watercolor",
    label: "Watercolor",
    description:
      "Films with a washed, translucent, paper-wet look.",
    terms: Object.freeze(["watercolor", "watercolour"]),
  },
]);

const FILTER_BY_ID = new Map(
  ANIMATION_TECHNIQUE_FILTERS.map((row) => [row.id, row])
);

const FILTER_ID_SET = new Set(ANIMATION_TECHNIQUE_FILTERS.map((row) => row.id));

/**
 * @param {unknown} value
 * @returns {value is AnimationTechniqueFilterId}
 */
export function isAnimationTechniqueFilter(value) {
  return typeof value === "string" && FILTER_ID_SET.has(value);
}

/**
 * @param {string | null | undefined} technique
 * @param {AnimationTechniqueFilterId} filterId
 */
export function techniqueMatchesFilter(technique, filterId) {
  const spec = FILTER_BY_ID.get(filterId);
  if (!spec) {
    return false;
  }

  const haystack = String(technique ?? "").toLowerCase();
  if (!haystack) {
    return false;
  }

  if (spec.terms.some((term) => haystack.includes(term))) {
    return true;
  }

  if (filterId === "digital-2d") {
    return haystack
      .split(",")
      .map((part) => part.trim())
      .some((part) => part === "2d" || part.startsWith("2d "));
  }

  return false;
}

/**
 * @param {{ technique?: string | null }} film
 * @param {AnimationTechniqueFilterId} filterId
 */
export function filmMatchesTechniqueFilter(film, filterId) {
  return techniqueMatchesFilter(film?.technique, filterId);
}

/**
 * @param {string | null | undefined} technique
 */
export function isStopMotionTechnique(technique) {
  return techniqueMatchesFilter(technique, "stop-motion");
}
