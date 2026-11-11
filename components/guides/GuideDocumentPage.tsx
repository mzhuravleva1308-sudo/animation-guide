import { Suspense } from "react";
import GuidePageClient from "@/components/guides/GuidePageClient";
import GuidePagePendingShell from "@/components/guides/GuidePagePendingShell";
import type { FestivalYearOption } from "@/components/festivals/FestivalYearSwitcher";
import {
  buildGuideJsonLd,
  listGuideJsonLdFilms,
} from "@/lib/guides/build-guide-json-ld.mjs";
import {
  findPublicGuideLinkBySlug,
  GUIDES_INDEX_PATH,
} from "@/lib/guides/public-guide-links.mjs";
import { GUIDE_DOCUMENT_AUTHOR } from "@/lib/guides/guide-document-attribution.mjs";
import {
  assertGuideFilmsLoaded,
  serializeJsonLd,
} from "@/lib/guides/guide-document-seo";
import { loadGuidePage } from "@/lib/load-guide-page";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

function guideAttribution(slug: string) {
  const indexMeta = findPublicGuideLinkBySlug(slug);
  if (!indexMeta) {
    return { authorName: null as string | null, updatedAt: null as string | null };
  }
  return {
    authorName: GUIDE_DOCUMENT_AUTHOR,
    updatedAt: indexMeta.updatedAt ?? null,
  };
}

type GuideContent = {
  slug: string;
  h1: string;
  documentTitle?: string;
  metaDescription?: string;
  intro: string[];
  personalNote: string;
  cta: { href: string; label: string };
  relatedGuides?: { href: string; label: string }[];
  anchorTitle?: string;
  groups: {
    heading: string;
    description?: string;
    films: (
      | { title: string; note?: string; kind?: "catalog" }
      | {
          kind: "short";
          title: string;
          year: number;
          runtimeLabel: string;
          watchUrl: string;
          posterUrl?: string;
          note?: string;
        }
      | { kind: "prose"; text: string }
    )[];
  }[];
};

export type GuideDocumentPageProps = {
  guide: GuideContent;
  path: string;
  description: string;
  sectionLink?: { href: string; label: string };
  pageTestId?: string;
  yearSwitcher?: { years: FestivalYearOption[]; activeYear: number } | null;
};

async function GuideDocumentBody({
  guide,
  path,
  description,
  sectionLink,
  pageTestId,
  yearSwitcher,
}: GuideDocumentPageProps) {
  const page = await loadGuidePage(guide);
  assertGuideFilmsLoaded(page);
  const indexMeta = findPublicGuideLinkBySlug(guide.slug);
  const attribution = guideAttribution(guide.slug);
  const showJsonLd = page.missingTitles.length === 0;
  const jsonLd = showJsonLd
    ? buildGuideJsonLd({
        origin: PUBLIC_SITE_ORIGIN,
        path,
        name: guide.h1,
        description,
        films: listGuideJsonLdFilms(page.groups),
        datePublished: indexMeta?.publishedAt ?? null,
        dateModified: indexMeta?.updatedAt ?? null,
        includeAuthor: Boolean(attribution.authorName),
      })
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(jsonLd),
          }}
        />
      ) : null}
      <GuidePageClient
        key="guide-ready"
        auth={page.auth}
        groups={page.groups}
        missingTitles={page.missingTitles}
        loadError={page.loadError}
        content={guide}
        postAuthPath={path}
        sectionLink={sectionLink}
        pageTestId={pageTestId}
        anchorFilm={page.anchorFilm}
        yearSwitcher={yearSwitcher}
        initialFilmRatings={page.initialFilmRatings}
        initialSavedFilmIds={page.initialSavedFilmIds}
        initialRatingUpdatedAtMs={page.initialRatingUpdatedAtMs}
        initialSavedAtMs={page.initialSavedAtMs}
        catalogUpdatedLabel={page.catalogUpdatedLabel}
        authorName={attribution.authorName}
        updatedAt={attribution.updatedAt}
      />
    </>
  );
}

/**
 * Guide + festival award document: paint static top immediately, stream films.
 * Sync wrapper so soft-nav hits Suspense fallback without waiting on auth/DB.
 * Pending shell is not GuidePageClient (avoids soft-nav stuck pending).
 */
export default function GuideDocumentPage({
  guide,
  path,
  description,
  sectionLink = { href: GUIDES_INDEX_PATH, label: "Guides" },
  pageTestId = "guide-page",
  yearSwitcher = null,
}: GuideDocumentPageProps) {
  const attribution = guideAttribution(guide.slug);

  return (
    <Suspense
      fallback={
        <GuidePagePendingShell
          auth={null}
          content={guide}
          postAuthPath={path}
          sectionLink={sectionLink}
          pageTestId={pageTestId}
          yearSwitcher={yearSwitcher}
          authorName={attribution.authorName}
          updatedAt={attribution.updatedAt}
        />
      }
    >
      <GuideDocumentBody
        guide={guide}
        path={path}
        description={description}
        sectionLink={sectionLink}
        pageTestId={pageTestId}
        yearSwitcher={yearSwitcher}
      />
    </Suspense>
  );
}
