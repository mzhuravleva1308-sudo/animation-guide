import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

/** Shared homepage / root SEO strings and assets. */
export const SITE_TITLE = "Resonale — Indie & Festival Animation Guide";

/** ~118 chars — fits SERP; mirrors the homepage hero so Google is less likely to rewrite. */
export const SITE_DESCRIPTION =
  "Find strange, beautiful and emotionally resonant animated films to watch next. Indie and festival animation worldwide.";

export const SITE_OG_IMAGE_PATH = "/og.png";

export const SITE_NAME = "Resonale";

/** WebSite + Organization graph; `#website` is referenced from guide/festival JSON-LD. */
export function buildSiteJsonLd() {
  const websiteId = `${PUBLIC_SITE_ORIGIN}/#website`;
  const organizationId = `${PUBLIC_SITE_ORIGIN}/#organization`;
  const logoUrl = `${PUBLIC_SITE_ORIGIN}/icon-512.png`;

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
        image: `${PUBLIC_SITE_ORIGIN}${SITE_OG_IMAGE_PATH}`,
      },
    ],
  };
}