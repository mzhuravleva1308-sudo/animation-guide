import { buildGuideDocumentAuthorNode } from "@/lib/guides/guide-document-attribution.mjs";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

/** Shared homepage / root SEO strings and assets. */
export const SITE_TITLE = "Resonale — Indie & Festival Animation Guide";

/** ~118 chars — fits SERP; mirrors the homepage hero so Google is less likely to rewrite. */
export const SITE_DESCRIPTION =
  "Find strange, beautiful and emotionally resonant animated films to watch next. Indie and festival animation worldwide.";

/** Square brand still (R + cat) used for homepage / fallback og:image. */
export const SITE_OG_IMAGE_PATH = "/og.jpg";

export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 1200;

export const SITE_NAME = "Resonale";

/** WebSite + WebPage + Organization + Person graph; `#website` / `#maria` are referenced from guides. */
export function buildSiteJsonLd() {
  const websiteId = `${PUBLIC_SITE_ORIGIN}/#website`;
  const webpageId = `${PUBLIC_SITE_ORIGIN}/#webpage`;
  const organizationId = `${PUBLIC_SITE_ORIGIN}/#organization`;
  const logoUrl = `${PUBLIC_SITE_ORIGIN}/icon-512.png`;
  const primaryImageUrl = `${PUBLIC_SITE_ORIGIN}${SITE_OG_IMAGE_PATH}`;
  const author = buildGuideDocumentAuthorNode(PUBLIC_SITE_ORIGIN);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: `${PUBLIC_SITE_ORIGIN}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": organizationId },
        image: primaryImageUrl,
      },
      {
        "@type": "WebPage",
        "@id": webpageId,
        url: `${PUBLIC_SITE_ORIGIN}/`,
        name: SITE_TITLE,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        isPartOf: { "@id": websiteId },
        about: { "@id": organizationId },
        primaryImageOfPage: primaryImageUrl,
        image: primaryImageUrl,
      },
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: `${PUBLIC_SITE_ORIGIN}/`,
        logo: {
          "@type": "ImageObject",
          url: logoUrl,
        },
        image: primaryImageUrl,
      },
      author,
    ],
  };
}