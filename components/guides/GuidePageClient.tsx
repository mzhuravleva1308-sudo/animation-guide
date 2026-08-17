"use client";

import {
  Bookmark,
  CircleCheck,
  Film as FilmIcon,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";
import EmailAuthModal from "@/components/EmailAuthModal";
import GuideEditorialGroups, {
  type GuideEditorialGroup,
} from "@/components/guides/GuideEditorialGroups";
import {
  HeaderIconButton,
  HeaderIconLink,
  HEADER_LOGIN_ICON,
  HEADER_NAV_ICON,
  headerNavLabelCollapse,
} from "@/components/HeaderIconControl";
import ResonaleBrand from "@/components/ResonaleBrand";
import { getFilmPosterUrl } from "@/lib/film-poster";
import { useCatalogFilmInteraction } from "@/lib/use-catalog-film-interaction";
import type { AuthUserSummary } from "@/lib/auth/session";
import type { Film } from "@/types/film";

type GuidePageContent = {
  h1: string;
  intro: string[];
  personalNote: string;
  cta: { href: string; label: string };
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

export default function GuidePageClient({
  auth: initialAuth,
  groups,
  missingTitles,
  loadError,
  content,
  postAuthPath,
  anchorFilm = null,
  initialFilmRatings = {},
  initialSavedFilmIds = [],
  initialRatingUpdatedAtMs = {},
  initialSavedAtMs = {},
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

  const animationNav = headerNavLabelCollapse(false, "sm");
  const savedNav = headerNavLabelCollapse(false, "lg");
  const watchedNav = headerNavLabelCollapse(false, "md");
  const showGroups = groups.length > 0 && missingTitles.length === 0;
  const anchorPosterUrl = anchorFilm ? getFilmPosterUrl(anchorFilm) : null;
  const introClassName =
    "font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]";
  const [firstIntro, ...restIntro] = content.intro;

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      data-testid="guide-page"
      data-ratings-ready={ratingsReady ? "true" : "false"}
    >
      <header className="mb-0">
        <div className="flex flex-nowrap items-center justify-between gap-1 sm:gap-3">
          <ResonaleBrand />

          <nav
            aria-label="Catalog and lists"
            className="flex shrink-0 items-center gap-0 sm:gap-2 md:gap-3"
          >
            <HeaderIconLink
              label="Animation"
              href="/"
              labelClassName={animationNav.labelClassName}
              data-testid="nav-animation"
            >
              <FilmIcon
                size={HEADER_NAV_ICON.size}
                strokeWidth={HEADER_NAV_ICON.strokeWidth}
                fill="none"
                className="shrink-0"
                aria-hidden="true"
              />
            </HeaderIconLink>
            {auth ? (
              <>
                <HeaderIconLink
                  label="Saved"
                  href="/"
                  labelClassName={savedNav.labelClassName}
                  iconActiveClassName={savedNav.iconActiveClassName}
                  data-testid="nav-saved"
                >
                  <Bookmark
                    size={HEADER_NAV_ICON.size}
                    strokeWidth={HEADER_NAV_ICON.strokeWidth}
                    fill="none"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                </HeaderIconLink>
                <HeaderIconLink
                  label="Watched"
                  href="/"
                  labelClassName={watchedNav.labelClassName}
                  iconActiveClassName={watchedNav.iconActiveClassName}
                  data-testid="nav-watched"
                >
                  <CircleCheck
                    size={HEADER_NAV_ICON.size}
                    strokeWidth={HEADER_NAV_ICON.strokeWidth}
                    fill="none"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                </HeaderIconLink>
              </>
            ) : null}
            {auth ? (
              <AccountMenu
                email={auth.email}
                profileName={auth.profile?.name ?? null}
              />
            ) : (
              <HeaderIconButton
                label="Log in"
                showLabel={false}
                buttonRef={authTriggerRef}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => openAuthModal(authTriggerRef.current)}
                data-testid="auth-status"
              >
                <UserRound
                  size={HEADER_LOGIN_ICON.size}
                  strokeWidth={HEADER_LOGIN_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconButton>
            )}
          </nav>
        </div>
      </header>

      <div className="mt-10 mb-8 sm:mt-12 sm:mb-10">
        <h1 className="font-sans text-[28px] font-medium leading-[1.2] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[32px]">
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
            <div className="min-w-0 max-w-[36rem] flex-1 space-y-3 max-[424px]:contents">
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
          <div className="mt-4 max-w-[36rem] space-y-3">
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
        />
      ) : null}

      {!loadError && !showGroups ? (
        <p className="rounded-2xl border border-dashed p-8 text-gray-500">
          This guide is temporarily unavailable.
        </p>
      ) : null}

      <div className="mt-16 max-w-[42rem]">
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
      </div>

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
