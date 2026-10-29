import type { Metadata } from "next";
import FilmsPageClient from "@/components/FilmsPageClient";
import { parseCatalogQuickFilter } from "@/lib/catalog-url";
import { serializeJsonLd } from "@/lib/guides/guide-document-seo";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";
import {
  SITE_DESCRIPTION,
  SITE_OG_IMAGE_PATH,
  SITE_TITLE,
  buildSiteJsonLd,
} from "@/lib/site-seo";

const siteJsonLd = buildSiteJsonLd();

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HomePageProps = {
  searchParams: Promise<{
    media?: string;
    sort?: string;
    filter?: string;
  }>;
};

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: PUBLIC_SITE_ORIGIN,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: PUBLIC_SITE_ORIGIN,
    siteName: "Resonale",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: SITE_OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "Resonale — Indie & Festival Animation Guide",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE_PATH],
  },
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  // Stage timings (incl. totalMs ≈ server page work) are logged from
  // loadPublicFilmCatalog in development via [catalog] load.
  // Public films/badges are cached inside the loader; this page stays dynamic
  // because auth + personalized order are request-specific.
  // Live-action Films catalog is available to all viewers.
  const catalog = await loadPublicFilmCatalog({
    media: params.media,
    sort: params.sort,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(siteJsonLd),
        }}
      />
      <FilmsPageClient
        auth={catalog.auth}
        films={catalog.films}
        freshTastePicks={catalog.freshTastePicks}
        rankingMode={catalog.rankingMode}
        awardWinningFilmIds={catalog.awardWinningFilmIds}
        pageSize={catalog.pageSize}
        loadError={catalog.loadError}
        initialFilmRatings={catalog.initialFilmRatings}
        initialSavedFilmIds={catalog.initialSavedFilmIds}
        initialRatingUpdatedAtMs={catalog.initialRatingUpdatedAtMs}
        initialSavedAtMs={catalog.initialSavedAtMs}
        scoresLastComputedAt={catalog.scoresLastComputedAt}
        catalogUpdatedLabel={catalog.catalogUpdatedLabel}
        catalogUpdatedShortLabel={catalog.catalogUpdatedShortLabel}
        mediaType={catalog.mediaType}
        sortParam={catalog.sortParam}
        showLiveActionTab={catalog.showLiveActionTab}
        initialQuickFilter={parseCatalogQuickFilter(
          params.filter,
          catalog.mediaType
        )}
        showSubtitle
      />
    </>
  );
}
