"use client";

import Link from "next/link";
import EmailAuthModal from "@/components/EmailAuthModal";
import GuideEditorialGroups, {
  type GuideEditorialGroup,
} from "@/components/guides/GuideEditorialGroups";
import GuideSectionHeader from "@/components/guides/GuideSectionHeader";
import SiteFooter from "@/components/SiteFooter";
import { getFilmPosterUrl } from "@/lib/film-poster";
import { GUIDES_INDEX_PATH } from "@/lib/guides/public-guide-links.mjs";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";
import { useCatalogFilmInteraction } from "@/lib/use-catalog-film-interaction";
import type { AuthUserSummary } from "@/lib/auth/session";
import type { Film } from "@/types/film";

type GuidePageContent = {
  h1: string;
  intro: string[];
  personalNote: string;
  cta: { href: string; label: string };
  relatedGuides?: { href: string; label: string }[];
};

type GuidePageClientProps = {
  auth: AuthUserSummary | null;
  groups: GuideEditorialGroup[];
  missingTitles: string[];
  loadError: string | null;
  content: GuidePageContent;
  postAuthPath: string;
  anchorFilm?: Film | null;
  initialFilmRatings?: Record<string, number>;
  initialSavedFilmIds?: string[];
  initialRatingUpdatedAtMs?: Record<string, number>;
  initialSavedAtMs?: Record<string, number>;
};

const introClassName =
  "font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]";
const relatedLinkClassName =
  "text-sm text-[#7a7b90] underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E] hover:decoration-[#1A1B2E]";

export default function GuidePageClient({
  auth: initialAuth,
  groups,
  missingTitles,
  loadError,
  content,
  postAuthPath,
  anchorFilm = null,
  initialFilmRatings,
  initialSavedFilmIds,
  initialRatingUpdatedAtMs,
  initialSavedAtMs,
}: GuidePageClientProps) {
  const {
    auth,
    profileId,
    profileSlug,
    savedFilmIds,
    filmRatings,
    ratingsReady,
    handleSavedChange,
    handleRatingChange,
    handleAuthRequired,
    openAuthModal,
    handleModalClose,
    modalOpen,
    modalLockScrollY,
    modalRestoreFocusElement,
    authTriggerRef,
  } = useCatalogFilmInteraction({
    initialAuth,
    initialFilmRatings,
    initialSavedFilmIds,
    initialRatingUpdatedAtMs,
    initialSavedAtMs,
    postAuthPath,
  });

  const showGroups = groups.length > 0 && missingTitles.length === 0;
  const anchorPosterUrl = anchorFilm ? getFilmPosterUrl(anchorFilm) : null;
  const [firstIntro, ...restIntro] = content.intro;

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      data-testid="guide-page"
      data-ratings-ready={ratingsReady ? "true" : "false"}
    >
      <GuideSectionHeader
        auth={auth}
        authTriggerRef={authTriggerRef}
        openAuthModal={openAuthModal}
      />

      <div className="mt-10 mb-8 sm:mt-12 sm:mb-10">
        <Link
          href={GUIDES_INDEX_PATH}
          data-testid="guide-section-link"
          className="text-sm text-[#7a7b90] transition hover:text-[#2f3040]"
        >
          Guides
        </Link>
        <h1 className="mt-3 font-sans text-[28px] font-medium leading-[1.2] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[32px]">
          {content.h1}
        </h1>
        {anchorPosterUrl ? (
          <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3 min-[425px]:flex-nowrap min-[425px]:gap-6">
            <img
              src={anchorPosterUrl}
              alt={anchorFilm?.title || "Flow"}
              data-testid="guide-anchor-poster"
              width={104}
              height={156}
              decoding="async"
              fetchPriority="high"
              className="aspect-[2/3] w-[104px] shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1 space-y-3 max-[424px]:contents">
              {firstIntro ? (
                <p className={`max-[424px]:min-w-0 max-[424px]:flex-1 ${introClassName}`}>
                  {firstIntro}
                </p>
              ) : null}
              {restIntro.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className={`max-[424px]:w-full ${introClassName}`}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className={`mt-4 space-y-3 ${GUIDE_PROSE_CLASS}`}>
            {content.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className={introClassName}>
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {loadError}
        </div>
      ) : null}

      {!loadError && showGroups ? (
        <GuideEditorialGroups
          groups={groups}
          profileId={profileId}
          profileSlug={profileSlug}
          savedFilmIds={savedFilmIds}
          filmRatings={filmRatings}
          ratingsReady={ratingsReady}
          onSavedChange={handleSavedChange}
          onRatingChange={handleRatingChange}
          onAuthRequired={auth ? undefined : handleAuthRequired}
          currentGuidePath={postAuthPath}
        />
      ) : null}

      {!loadError && !showGroups ? (
        <p className="rounded-2xl border border-dashed p-8 text-gray-500">
          This guide is temporarily unavailable.
        </p>
      ) : null}

      <div className={`mt-16 ${GUIDE_PROSE_CLASS}`}>
        <p
          data-testid="guide-personal-note"
          className="font-sans text-[15px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]"
        >
          {content.personalNote}
        </p>
        <Link
          href={content.cta.href}
          data-testid="guide-cta"
          className="mt-5 inline-flex rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {content.cta.label}
        </Link>
        <div className="mt-8" data-testid="guide-related">
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
      </div>

      <SiteFooter />

      <EmailAuthModal
        open={modalOpen}
        onClose={handleModalClose}
        postAuthPath={postAuthPath}
        lockScrollY={modalLockScrollY}
        restoreFocusElement={modalRestoreFocusElement}
      />
    </main>
  );
}
