import type { Metadata } from "next";
import GuidesIndexClient from "@/components/guides/GuidesIndexClient";
import { getAuthUserSummary } from "@/lib/auth/session";
import { serializeJsonLd } from "@/lib/guides/guide-document-seo";
import {
  GUIDES_INDEX_PATH,
  PUBLIC_GUIDE_LINKS,
} from "@/lib/guides/public-guide-links.mjs";
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

const jsonLd = {
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
      mainEntity: { "@id": `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}#itemlist` },
    },
    {
      "@type": "ItemList",
      "@id": `${PUBLIC_SITE_ORIGIN}${GUIDES_INDEX_PATH}#itemlist`,
      name: "Guides to Animated Films",
      numberOfItems: PUBLIC_GUIDE_LINKS.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: PUBLIC_GUIDE_LINKS.map((guide, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${PUBLIC_SITE_ORIGIN}${guide.href}`,
        name: guide.title,
      })),
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

export default async function GuidesIndexPage() {
  const auth = await getAuthUserSummary();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <GuidesIndexClient auth={auth} />
    </>
  );
}
