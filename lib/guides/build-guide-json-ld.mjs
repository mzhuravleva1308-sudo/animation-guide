/**
 * CollectionPage + ItemList + BreadcrumbList JSON-LD for editorial guides.
 *
 * @param {{
 *   origin: string,
 *   path: string,
 *   name: string,
 *   description: string,
 *   filmTitles: string[],
 * }} options
 */
export function buildGuideJsonLd({
  origin,
  path,
  name,
  description,
  filmTitles,
}) {
  const url = `${origin}${path}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name,
        description,
        inLanguage: "en",
        isPartOf: { "@id": `${origin}/#website` },
        mainEntity: { "@id": `${url}#itemlist` },
      },
      {
        "@type": "ItemList",
        "@id": `${url}#itemlist`,
        name,
        numberOfItems: filmTitles.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: filmTitles.map((title, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Movie",
            name: title,
          },
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
