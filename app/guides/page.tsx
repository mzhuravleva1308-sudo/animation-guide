import type { Metadata } from "next";
import GuidesIndexClient from "@/components/guides/GuidesIndexClient";
import { getAuthUserSummary } from "@/lib/auth/session";
import { getFilmPosterUrl } from "@/lib/film-poster";
import { absolutizeJsonLdUrl } from "@/lib/guides/build-guide-json-ld.mjs";
import { serializeJsonLd } from "@/lib/guides/guide-document-seo";
import {
  GUIDES_INDEX_PATH,
  PUBLIC_GUIDE_LINKS,
} from "@/lib/guides/public-guide-links.mjs";
import { findGuideFilmByTitle } from "@/lib/guides/resolve-guide-films.mjs";
import { loadCatalogUpdatedLabel } from "@/lib/load-catalog-last-updated";
import { loadGuideCoverFilms } from "@/lib/load-guide-page";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

const TITLE = "Guides to Animated Films | Resonale";
const DESCRIPTION =
  "Curated guides to independent, festival, and distinctive animation — films to watch next, gathered in one place.";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: GUIDES_INDEX_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: GUIDES_INDEX_PATH,
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

function buildGuidesIndexJsonLd(
  guides: {
    href: string;
    title: string;
    description: string;
    coverPosterUrl: string | null;
  }[]
) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}#webpage`,
        url: `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}`,
        name: "Guides to Animated Films",
        description: DESCRIPTION,
        inLanguage: "en",
        isPartOf: { "@id": `${PUBLIC_SITE_ORIGIN}/#website` },
        mainEntity: {
          "@id": `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}#itemlist`,
        },
      },
      {
        "@type": "ItemList",
        "@id": `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}#itemlist`,
        name: "Guides to Animated Films",
        numberOfItems: guides.length,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: guides.map((guide, index) => {
          const url = `${PUBLIC_SITE_ORIGIN}${guide.href}`;
          const image = absolutizeJsonLdUrl(
            PUBLIC_SITE_ORIGIN,
            guide.coverPosterUrl
          );
          /** @type {Record<string, unknown>} */
          const item: Record<string, unknown> = {
            "@type": "CollectionPage",
            "@id": `${url}#webpage`,
            url,
            name: guide.title,
            description: guide.description,
          };
          if (image) {
            item.image = image;
          }
          return {
            "@type": "ListItem",
            position: index + 1,
            url,
            name: guide.title,
            item,
          };
        }),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}#breadcrumb`,
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
            name: "Guides",
            item: `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}`,
          },
        ],
      },
    ],
  };
}

export default async function GuidesIndexPage() {
  const [auth, covers, catalogUpdatedLabel] = await Promise.all([
    getAuthUserSummary(),
    loadGuideCoverFilms(PUBLIC_GUIDE_LINKS.map((guide) => guide.coverTitle)),
    loadCatalogUpdatedLabel(),
  ]);

  const guides = PUBLIC_GUIDE_LINKS.map((guide) => {
    const film = findGuideFilmByTitle(covers.films, guide.coverTitle);

    return {
      slug: guide.slug,
      href: guide.href,
      title: guide.title,
      description: guide.description,
      coverPosterUrl: film ? getFilmPosterUrl(film) : null,
    };
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildGuidesIndexJsonLd(guides)),
        }}
      />
      <GuidesIndexClient
        auth={auth}
        guides={guides}
        catalogUpdatedLabel={catalogUpdatedLabel}
      />
    </>
  );
}
