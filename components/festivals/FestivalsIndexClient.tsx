"use client";

import Link from "next/link";
import EmailAuthModal from "@/components/EmailAuthModal";
import GuideSectionHeader from "@/components/guides/GuideSectionHeader";
import SiteFooter from "@/components/SiteFooter";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_INDEX_PATH,
  FESTIVALS_YEAR_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";
import { useCatalogFilmInteraction } from "@/lib/use-catalog-film-interaction";
import type { AuthUserSummary } from "@/lib/auth/session";

const INTRO =
  "Feature winners from the major animation festivals Resonale tracks — start with a festival, then open any film in the catalog.";

export type FestivalsIndexItem = {
  slug: string;
  href: string;
  title: string;
  description: string;
  country: string;
  coverPosterUrl: string | null;
};

type FestivalsIndexClientProps = {
  auth: AuthUserSummary | null;
  festivals: FestivalsIndexItem[];
  catalogUpdatedLabel?: string | null;
};

export default function FestivalsIndexClient({
  auth: initialAuth,
  festivals,
  catalogUpdatedLabel = null,
}: FestivalsIndexClientProps) {
  const {
    auth,
    openAuthModal,
    handleModalClose,
    modalOpen,
    modalLockScrollY,
    modalRestoreFocusElement,
    authTriggerRef,
  } = useCatalogFilmInteraction({
    initialAuth,
    postAuthPath: FESTIVALS_INDEX_PATH,
  });

  const calendarHref = FESTIVALS_YEAR_PATH(CURRENT_FESTIVAL_YEAR);

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      data-testid="festivals-index"
    >
      <GuideSectionHeader
        auth={auth}
        authTriggerRef={authTriggerRef}
        openAuthModal={openAuthModal}
      />

      <div className="mt-10 mb-8 sm:mt-12 sm:mb-10">
        <h1 className="font-sans text-[28px] font-medium leading-[1.2] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[32px]">
          Animation Festival Winners
        </h1>
        <p
          className={`mt-4 font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none] ${GUIDE_PROSE_CLASS}`}
        >
          {INTRO}
        </p>
      </div>

      <ul className="grid gap-8">
        {festivals.map((festival, index) => {
          const headingId = `festivals-index-heading-${festival.slug}`;

          return (
            <li key={festival.href}>
              <Link
                href={festival.href}
                data-testid={`festivals-index-${festival.slug}`}
                aria-labelledby={headingId}
                className="group flex items-start gap-4 sm:gap-6"
              >
                <div
                  data-testid={`festivals-index-cover-${festival.slug}`}
                  aria-hidden="true"
                  className="aspect-[2/3] w-[104px] shrink-0 overflow-hidden rounded-xl bg-[#eeeef4]"
                >
                  {festival.coverPosterUrl ? (
                    <img
                      src={festival.coverPosterUrl}
                      alt=""
                      width={104}
                      height={156}
                      decoding="async"
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id={headingId}
                    className="font-sans text-[22px] font-medium leading-[1.25] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[24px]"
                  >
                    <span className="underline decoration-[#c5c2d6] underline-offset-4 group-hover:text-[#1A1B2E] group-hover:decoration-[#1A1B2E]">
                      {festival.title}
                    </span>
                  </h2>
                  <p className="mt-1 font-sans text-[14px] font-normal leading-[1.5] text-[#7a7b90] antialiased [font-synthesis:none]">
                    {festival.country}
                  </p>
                  <p className="mt-3 text-[15px] leading-7 text-[#4a4b5c]">
                    {festival.description}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={`mt-16 ${GUIDE_PROSE_CLASS}`}>
        <Link
          href={calendarHref}
          data-testid="festivals-index-calendar-link"
          className="text-sm text-[#7a7b90] underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E] hover:decoration-[#1A1B2E]"
        >
          Animation festivals in {CURRENT_FESTIVAL_YEAR} — dates and places
        </Link>
      </div>

      <SiteFooter catalogUpdatedLabel={catalogUpdatedLabel} />

      <EmailAuthModal
        open={modalOpen}
        onClose={handleModalClose}
        postAuthPath={FESTIVALS_INDEX_PATH}
        lockScrollY={modalLockScrollY}
        restoreFocusElement={modalRestoreFocusElement}
      />
    </main>
  );
}
