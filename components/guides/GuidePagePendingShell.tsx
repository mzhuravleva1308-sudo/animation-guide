"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import EmailAuthModal from "@/components/EmailAuthModal";
import FestivalYearSwitcher, {
  type FestivalYearOption,
} from "@/components/festivals/FestivalYearSwitcher";
import GuideDocumentAttribution from "@/components/guides/GuideDocumentAttribution";
import { GUIDE_DISPLAY_H1_CLASS } from "@/components/guides/guide-display-font";
import GuideSectionHeader from "@/components/guides/GuideSectionHeader";
import SiteFooter from "@/components/SiteFooter";
import { GUIDES_INDEX_PATH } from "@/lib/guides/public-guide-links.mjs";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";
import GuideDiscoveryPromo, {
  type GuideDiscoveryPromoContent,
} from "@/components/guides/GuideDiscoveryPromo";
import { markScrollHomeToTop } from "@/lib/scroll-home-to-top";
import type { AuthUserSummary } from "@/lib/auth/session";

type GuidePortrait = {
  src: string;
  alt: string;
  credit?: string;
  creditHref?: string;
};

type GuidePageContent = {
  h1: string;
  intro: string[];
  personalNote: string;
  cta: { href: string; label: string };
  relatedGuides?: { href: string; label: string }[];
  portrait?: GuidePortrait;
  discoveryPromo?: GuideDiscoveryPromoContent;
};

type GuidePagePendingShellProps = {
  auth: AuthUserSummary | null;
  content: GuidePageContent;
  postAuthPath: string;
  sectionLink?: { href: string; label: string };
  pageTestId?: string;
  yearSwitcher?: { years: FestivalYearOption[]; activeYear: number } | null;
  authorName?: string | null;
  updatedAt?: string | null;
};

const introClassName =
  "font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]";
const relatedLinkClassName =
  "text-sm text-[#7a7b90] underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E] hover:decoration-[#1A1B2E]";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

function FilmCardSkeleton() {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 rounded-2xl border border-gray-100 p-3 min-[900px]:grid-cols-[140px_minmax(0,1fr)] min-[900px]:gap-x-0 min-[900px]:p-0 min-[1100px]:grid-cols-[190px_minmax(0,1fr)]">
      <SkeletonBlock className="aspect-[2/3] w-full rounded-xl min-[900px]:row-span-2 min-[900px]:aspect-auto min-[900px]:min-h-[12rem] min-[900px]:rounded-none" />
      <div className="space-y-3 min-[900px]:p-5">
        <SkeletonBlock className="h-5 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
      <div className="col-span-2 space-y-3 pt-3 min-[900px]:col-span-1 min-[900px]:col-start-2 min-[900px]:px-5 min-[900px]:pb-5 min-[900px]:pt-0">
        <SkeletonBlock className="h-16 w-full" />
      </div>
    </div>
  );
}

/**
 * Instant guide/festival chrome while film groups stream in.
 * Must stay a different component type than GuidePageClient.
 */
export default function GuidePagePendingShell({
  auth,
  content,
  postAuthPath,
  sectionLink = { href: GUIDES_INDEX_PATH, label: "Guides" },
  pageTestId = "guide-page",
  yearSwitcher = null,
  authorName = null,
  updatedAt = null,
}: GuidePagePendingShellProps) {
  const authTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLockScrollY, setModalLockScrollY] = useState<number | undefined>(
    undefined
  );

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      aria-busy="true"
      aria-label="Loading guide films"
      data-testid={`${pageTestId}-pending`}
    >
      <GuideSectionHeader
        auth={auth}
        authTriggerRef={authTriggerRef}
        openAuthModal={() => {
          setModalLockScrollY(window.scrollY);
          setModalOpen(true);
        }}
      />

      <div className="mt-10 mb-8 sm:mt-12 sm:mb-10">
        <Link
          href={sectionLink.href}
          data-testid="guide-section-link"
          className="text-sm text-[#7a7b90] transition hover:text-[#2f3040]"
        >
          {sectionLink.label}
        </Link>
        <h1 className={GUIDE_DISPLAY_H1_CLASS}>{content.h1}</h1>
        {yearSwitcher ? (
          <FestivalYearSwitcher
            years={yearSwitcher.years}
            activeYear={yearSwitcher.activeYear}
          />
        ) : null}
        <div className={`mt-4 space-y-3 ${GUIDE_PROSE_CLASS}`}>
          {content.portrait ? (
            <SkeletonBlock className="float-left mb-3 mr-5 aspect-[2/3] w-[104px]" />
          ) : null}
          {content.intro.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className={introClassName}>
              {paragraph}
            </p>
          ))}
          {content.portrait ? (
            <div className="clear-both" aria-hidden="true" />
          ) : null}
        </div>
      </div>

      <section className="grid gap-4" data-testid="guide-films-pending">
        <SkeletonBlock className="mb-2 h-6 w-64" />
        <SkeletonBlock className="mb-4 h-12 w-full max-w-xl" />
        <FilmCardSkeleton />
        <FilmCardSkeleton />
        <FilmCardSkeleton />
      </section>

      {content.discoveryPromo ? (
        <GuideDiscoveryPromo content={content.discoveryPromo} />
      ) : null}

      <div
        className={`${content.discoveryPromo ? "mt-10" : "mt-16"} ${GUIDE_PROSE_CLASS}`}
      >
        {!content.discoveryPromo ? (
          <>
            <p
              data-testid="guide-personal-note"
              className="font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]"
            >
              {content.personalNote}
            </p>
            <Link
              href={content.cta.href}
              data-testid="guide-cta"
              scroll
              onClick={() => {
                markScrollHomeToTop();
                window.scrollTo(0, 0);
              }}
              className="mt-5 inline-flex rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {content.cta.label}
            </Link>
          </>
        ) : null}
        <div
          className={content.discoveryPromo ? undefined : "mt-8"}
          data-testid="guide-related"
        >
          <p className="font-sans text-[15px] font-medium leading-[1.65] text-[#1A1B2E] antialiased [font-synthesis:none]">
            More guides
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <Link
              href={GUIDES_INDEX_PATH}
              data-testid="guide-related-index"
              className={relatedLinkClassName}
            >
              Guides to Animated Films
            </Link>
            {content.relatedGuides?.map((guide) => (
              <Link
                key={guide.href}
                href={guide.href}
                data-testid="guide-related-link"
                className={relatedLinkClassName}
              >
                {guide.label}
              </Link>
            ))}
          </div>
        </div>
        {authorName || updatedAt ? (
          <GuideDocumentAttribution
            authorName={authorName}
            updatedAt={updatedAt}
          />
        ) : null}
      </div>

      <SiteFooter catalogUpdatedLabel={null} />

      <EmailAuthModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalLockScrollY(undefined);
        }}
        postAuthPath={postAuthPath}
        reason="login"
        lockScrollY={modalLockScrollY}
        restoreFocusElement={authTriggerRef.current}
      />
    </main>
  );
}
