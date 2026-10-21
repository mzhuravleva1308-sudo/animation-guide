import type { Metadata } from "next";
import Link from "next/link";
import ResonaleBrand from "@/components/ResonaleBrand";
import SiteFooter from "@/components/SiteFooter";
import {
  formatFestivalEditionDates,
  listAnimationFestivals2026,
} from "@/lib/festivals/animation-festivals-2026.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_ANNECY_PATH,
  FESTIVALS_YEAR_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
import { serializeJsonLd } from "@/lib/guides/guide-document-seo";
import { loadCatalogUpdatedLabel } from "@/lib/load-catalog-last-updated";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

const YEAR = CURRENT_FESTIVAL_YEAR;
const PATH = FESTIVALS_YEAR_PATH(YEAR);
const TITLE = `Animation Festivals ${YEAR} | Resonale`;
const DESCRIPTION =
  "Major animation festivals Resonale tracks in 2026 — dates, locations, and official links.";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PATH,
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

const bodyClassName =
  "mt-3 font-sans text-[15px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]";
const metaClassName =
  "mt-1 font-sans text-[14px] font-normal leading-[1.5] text-[#7a7b90] antialiased [font-synthesis:none]";
const titleLinkClassName =
  "text-[#1A1B2E] underline decoration-[#c5c2d6] underline-offset-2 transition hover:decoration-[#1A1B2E]";

const festivals = listAnimationFestivals2026();

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${PUBLIC_SITE_ORIGIN}${PATH}#webpage`,
      url: `${PUBLIC_SITE_ORIGIN}${PATH}`,
      name: `Animation Festivals ${YEAR}`,
      description: DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": `${PUBLIC_SITE_ORIGIN}/#website` },
      mainEntity: { "@id": `${PUBLIC_SITE_ORIGIN}${PATH}#itemlist` },
    },
    {
      "@type": "ItemList",
      "@id": `${PUBLIC_SITE_ORIGIN}${PATH}#itemlist`,
      name: `Animation Festivals ${YEAR}`,
      numberOfItems: festivals.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: festivals.map((festival, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: festival.name,
        url: festival.url,
      })),
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${PUBLIC_SITE_ORIGIN}${PATH}#breadcrumb`,
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
          name: `Festivals ${YEAR}`,
          item: `${PUBLIC_SITE_ORIGIN}${PATH}`,
        },
      ],
    },
  ],
};

export default async function AnimationFestivals2026Page() {
  const catalogUpdatedLabel = await loadCatalogUpdatedLabel();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <main
        className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
        data-testid="festivals-2026-page"
      >
        <header>
          <ResonaleBrand />
        </header>

        <article className="mt-10 max-w-[42rem] sm:mt-12">
          <h1 className="font-sans text-[28px] font-medium leading-[1.2] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[32px]">
            Animation Festivals {YEAR}
          </h1>
          <p className={bodyClassName}>
            The major animation festivals Resonale tracks — dates and places
            for {YEAR}.
          </p>

          <ol className="mt-10 list-none space-y-10 p-0">
            {festivals.map((festival) => {
              const dates = formatFestivalEditionDates(
                festival.startDate,
                festival.endDate,
                festival.dateNote
              );
              const place = [festival.city, festival.country]
                .filter(Boolean)
                .join(", ");

              return (
                <li
                  key={festival.festivalId}
                  data-testid={`festival-${festival.festivalId}`}
                >
                  <h2 className="font-sans text-[20px] font-medium leading-[1.3] tracking-tight antialiased [font-synthesis:none]">
                    <a
                      href={festival.url}
                      className={titleLinkClassName}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`festival-link-${festival.festivalId}`}
                    >
                      {festival.name}
                    </a>
                  </h2>
                  <p className={metaClassName}>
                    {dates}
                    {place ? ` · ${place}` : null}
                  </p>
                  <p className={bodyClassName}>{festival.description}</p>
                  {festival.festivalId === "annecy" ? (
                    <p className={`${bodyClassName} mt-2`}>
                      <Link
                        href={FESTIVALS_ANNECY_PATH(YEAR)}
                        className={titleLinkClassName}
                        data-testid="festival-annecy-awards-link"
                      >
                        2026 feature film awards
                      </Link>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </article>

        <div className="max-w-[42rem]">
          <SiteFooter catalogUpdatedLabel={catalogUpdatedLabel} />
        </div>
      </main>
    </>
  );
}
