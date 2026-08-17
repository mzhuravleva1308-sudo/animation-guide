import type { MetadataRoute } from "next";

const PUBLIC_SITE_ORIGIN = "https://resonale.com";

/**
 * Only stable public canonical URLs. The live-action catalog is the same
 * homepage with a client query (`/?media=live_action`), not a separate page.
 * Film detail routes do not exist yet.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${PUBLIC_SITE_ORIGIN}/`,
    },
  ];
}
