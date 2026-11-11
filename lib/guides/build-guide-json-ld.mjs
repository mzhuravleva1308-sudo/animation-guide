/**
 * CollectionPage + ItemList + BreadcrumbList JSON-LD for editorial guides.
 * Movie items include image (required for Google rich results) plus director/year when known.
 *
 * @typedef {{
 *   name: string,
 *   image?: string | null,
 *   director?: string | null,
 *   dateCreated?: string | null,
 * }} GuideJsonLdFilm
 *
 * @param {{
 *   origin: string,
 *   path: string,
 *   name: string,
 *   description: string,
 *   films: GuideJsonLdFilm[],
 *   datePublished?: string | null,
 *   dateModified?: string | null,
 * }} options
 */
export function buildGuideJsonLd({
  origin,
  path,
  name,
  description,
  films,
  datePublished = null,
  dateModified = null,
}) {
  const url = `${origin}${path}`;
  /** @type {Record<string, unknown>} */
  const webpage = {
    "@type": "CollectionPage",
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${origin}/#website` },
    mainEntity: { "@id": `${url}#itemlist` },
  };
  if (datePublished) {
    webpage.datePublished = datePublished;
  }
  if (dateModified) {
    webpage.dateModified = dateModified;
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      webpage,
      {
        "@type": "ItemList",
        "@id": `${url}#itemlist`,
        name,
        numberOfItems: films.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: films.map((film, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: buildMovieNode(origin, film),
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${origin}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Guides",
            item: `${origin}/guides`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name,
            item: url,
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "Resonale",
        url: origin,
      },
    ],
  };
}

/**
 * @param {string} origin
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function absolutizeJsonLdUrl(origin, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) {
    const base = String(origin ?? "").replace(/\/$/, "");
    return `${base}${raw}`;
  }
  return raw;
}

/**
 * @param {string} origin
 * @param {GuideJsonLdFilm} film
 * @returns {Record<string, unknown>}
 */
function buildMovieNode(origin, film) {
  /** @type {Record<string, unknown>} */
  const movie = {
    "@type": "Movie",
    name: film.name,
  };
  const image = absolutizeJsonLdUrl(origin, film.image);
  if (image) {
    movie.image = image;
  }
  const director = String(film.director ?? "").trim();
  if (director) {
    movie.director = {
      "@type": "Person",
      name: director,
    };
  }
  const dateCreated = String(film.dateCreated ?? "").trim();
  if (dateCreated) {
    movie.dateCreated = dateCreated;
  }
  return movie;
}

/**
 * Resolved guide groups → Movie fields for JSON-LD ItemList.
 *
 * @param {Array<{
 *   items?: Array<
 *     | { kind: "catalog", film: {
 *         title: string,
 *         poster_url?: string | null,
 *         image_url?: string | null,
 *         director?: string | null,
 *         year?: number | null,
 *       }, note?: string | null }
 *     | { kind: "short", title: string, year: number, posterUrl?: string | null }
 *     | { kind: "prose", text: string }
 *   >
 * }> | null | undefined} groups
 * @returns {GuideJsonLdFilm[]}
 */
export function listGuideJsonLdFilms(groups) {
  return (groups ?? []).flatMap((group) =>
    (group.items ?? []).flatMap((item) => {
      if (!item || item.kind === "prose") {
        return [];
      }
      if (item.kind === "short") {
        const name = String(item.title ?? "").trim();
        if (!name) return [];
        const image = String(item.posterUrl ?? "").trim();
        const year = Number(item.year);
        return [
          {
            name,
            image: image || null,
            director: null,
            dateCreated: Number.isFinite(year) ? String(year) : null,
          },
        ];
      }

      const film = item.film;
      const name = String(film?.title ?? "").trim();
      if (!name) return [];
      const image =
        String(film?.poster_url ?? "").trim() ||
        String(film?.image_url ?? "").trim();
      const director = String(film?.director ?? "").trim();
      const year = Number(film?.year);
      return [
        {
          name,
          image: image || null,
          director: director || null,
          dateCreated: Number.isFinite(year) ? String(year) : null,
        },
      ];
    })
  );
}
