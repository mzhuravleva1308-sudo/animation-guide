import type { MetadataRoute } from "next";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";
import { PUBLIC_SITEMAP_PATHS } from "@/lib/public-sitemap-urls.mjs";

/**
 * Only stable public canonical URLs. The live-action catalog is the same
 * homepage with a client query (`/?media=live_action`), not a separate page.
 * Film detail routes do not exist yet.
 *
 * lastModified is the deploy time so crawlers re-read the file after a release.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_SITEMAP_PATHS.map((path, index) => ({
    url: path === "/" ? `${PUBLIC_SITE_ORIGIN}/` : `${PUBLIC_SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency: index === 0 ? "daily" : "weekly",
    priority: index === 0 ? 1 : path.startsWith("/guides") ? 0.8 : 0.3,
  }));
}
