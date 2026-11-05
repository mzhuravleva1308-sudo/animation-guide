import type { Metadata } from "next";
import { Suspense } from "react";
import FilmsCatalogPendingShell from "@/components/FilmsCatalogPendingShell";
import FilmsPageClient from "@/components/FilmsPageClient";
import { getAuthUserSummary } from "@/lib/auth/session";
import { parseCatalogQuickFilter } from "@/lib/catalog-url";
import { serializeJsonLd } from "@/lib/guides/guide-document-seo";
import {
  loadPublicFilmCatalog,
  resolveCatalogRankingForViewer,
} from "@/lib/load-public-film-catalog";
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

type HomeSearchParams = {
  media?: string;
  sort?: string;
  filter?: string;
};

type HomePageProps = {
  searchParams: Promise<HomeSearchParams>;
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

async function HomeCatalogBody({
  params,
  auth,
}: {
  params: HomeSearchParams;
  auth: Awaited<ReturnType<typeof getAuthUserSummary>>;
}) {
  const catalog = await loadPublicFilmCatalog({
    media: params.media,
    sort: params.sort,
    reuseAuth: auth,
  });

  return (
    <FilmsPageClient
      key="catalog-ready"
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
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  // Auth first so the pending shell can paint real Saved/Watched while films stream.
  // Fallback is FilmsCatalogPendingShell (not FilmsPageClient) so soft nav from
  // guides remounts the ready catalog instead of sticking on catalogPending.
  const auth = await getAuthUserSummary();
  const ranking = resolveCatalogRankingForViewer(
    { media: params.media, sort: params.sort },
    auth?.email
  );
  const initialQuickFilter = parseCatalogQuickFilter(
    params.filter,
    ranking.mediaType
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(siteJsonLd),
        }}
      />
      <Suspense
        fallback={
          <FilmsCatalogPendingShell
            auth={auth}
            showLiveActionTab={ranking.showLiveActionTab}
            mediaType={ranking.mediaType}
            initialQuickFilter={initialQuickFilter}
            showSubtitle
          />
        }
      >
        <HomeCatalogBody params={params} auth={auth} />
      </Suspense>
    </>
  );
}
