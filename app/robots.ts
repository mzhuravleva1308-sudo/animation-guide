import type { MetadataRoute } from "next";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

/**
 * Inspected App Router surface (do not Disallow more without checking):
 * Public catalog: `/`
 * Search-intent guides: `/guides/*`
 * Legal: `/privacy`
 * Auth UI: `/login`
 * Auth handlers: `/auth/callback`, `/auth/logout`, `/auth/provision`
 * Admin UI: `/admin/*`
 * JSON/system APIs: `/api/*`
 * Retired share links: `/p/[slug]`
 * Redirect-only leftovers (`/films`, `/saved`, `/watched`, `/my-profile`) 308 to `/`
 * and are left crawlable so Google can consolidate on the homepage.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/login", "/auth/", "/api/", "/p/"],
    },
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
