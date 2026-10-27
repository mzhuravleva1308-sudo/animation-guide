import type { Metadata } from "next";
import FestivalsIndexClient from "@/components/festivals/FestivalsIndexClient";
import { getAuthUserSummary } from "@/lib/auth/session";
import { getFilmPosterUrl } from "@/lib/film-poster";
import { PUBLIC_FESTIVAL_AWARD_LINKS } from "@/lib/festivals/public-festival-award-links.mjs";
import { FESTIVALS_INDEX_PATH } from "@/lib/festivals/public-festival-paths.mjs";
import { serializeJsonLd } from "@/lib/guides/guide-document-seo";
import { findGuideFilmByTitle } from "@/lib/guides/resolve-guide-films.mjs";
import { loadCatalogUpdatedLabel } from "@/lib/load-catalog-last-updated";
import { loadGuideCoverFilms } from "@/lib/load-guide-page";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

const TITLE = "Animation Festival Winners | Resonale";
const DESCRIPTION =
  "Feature film winners from major animation festivals — Annecy, Ottawa, and more Resonale tracks.";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: FESTIVALS_INDEX_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: FESTIVALS_INDEX_PATH,
    siteName: "Resonale",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${PUBLIC_SITE_ORIGIN}${FESTIVALS_INDEX_PATH}#webpage`,
      url: `${PUBLIC_SITE_ORIGIN}${FESTIVALS_INDEX_PATH}`,
      name: "Animation Festival Winners",
      description: DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": `${PUBLIC_SITE_ORIGIN}/#website` },
      mainEntity: {
        "@id": `${PUBLIC_SITE_ORIGIN}${FESTIVALS_INDEX_PATH}#itemlist`,
      },
    },
    {
      "@type": "ItemList",
      "@id": `${PUBLIC_SITE_ORIGIN}${FESTIVALS_INDEX_PATH}#itemlist`,
      name: "Animation Festival Winners",
      numberOfItems: PUBLIC_FESTIVAL_AWARD_LINKS.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: PUBLIC_FESTIVAL_AWARD_LINKS.map((festival, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${PUBLIC_SITE_ORIGIN}${festival.href}`,
        name: festival.title,
      })),
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${PUBLIC_SITE_ORIGIN}${FESTIVALS_INDEX_PATH}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${PUBLIC_SITE_ORIGIN}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Festivals",
          item: `${PUBLIC_SITE_ORIGIN}${FESTIVALS_INDEX_PATH}`,
        },
      ],
    },
  ],
};

export default async function FestivalsIndexPage() {
  const [auth, covers, catalogUpdatedLabel] = await Promise.all([
    getAuthUserSummary(),
    loadGuideCoverFilms(
      PUBLIC_FESTIVAL_AWARD_LINKS.map((festival) => festival.coverTitle)
    ),
    loadCatalogUpdatedLabel(),
  ]);

  const festivals = PUBLIC_FESTIVAL_AWARD_LINKS.map((festival) => {
    const film = findGuideFilmByTitle(covers.films, festival.coverTitle);

    return {
      slug: festival.slug,
      href: festival.href,
      title: festival.title,
      description: festival.description,
      country: festival.country,
      coverPosterUrl: film ? getFilmPosterUrl(film) : null,
    };
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <FestivalsIndexClient
        auth={auth}
        festivals={festivals}
        catalogUpdatedLabel={catalogUpdatedLabel}
      />
    </>
  );
}
