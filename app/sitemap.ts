import type { MetadataRoute } from "next";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

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
    {
      url: `${PUBLIC_SITE_ORIGIN}/guides/films-like-flow`,
    },
  ];
}
