"use client";

import {
  Bookmark,
  CircleCheck,
  Clapperboard,
  Film as FilmIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import CatalogHeroBanner from "@/components/CatalogHeroBanner";
import {
  HeaderIconLink,
  HEADER_NAV_ICON,
  headerNavLabelCollapse,
} from "@/components/HeaderIconControl";
import ResonaleBrand, {
  RESONALE_BRAND_TAGLINE,
} from "@/components/ResonaleBrand";
import type { AuthUserSummary } from "@/lib/auth/session";
import { MEDIA_TYPE, type MediaType } from "@/lib/media-type";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

function FilmCardSkeleton() {
  return (
    <div
      data-testid="films-loading-skeleton"
      className="grid gap-5 rounded-2xl border border-gray-100 p-5 md:grid-cols-[160px_1fr]"
    >
      <SkeletonBlock className="h-56 w-full md:h-60" />
      <div className="space-y-4">
        <SkeletonBlock className="h-7 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
        <SkeletonBlock className="h-20 w-full" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-20" />
          <SkeletonBlock className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}

type FilmsCatalogPendingShellProps = {
  auth?: AuthUserSummary | null;
  showLiveActionTab?: boolean;
  /** Homepage shows the catalog hero under the brand row. */
  showSubtitle?: boolean;
  mediaType?: MediaType;
};

/**
 * Instant catalog chrome while film cards stream in: real header (and hero),
 * skeleton cards. Used as Suspense fallback and route loading UI.
 */
export default function FilmsCatalogPendingShell({
  auth = null,
  showLiveActionTab = false,
  showSubtitle = false,
  mediaType = MEDIA_TYPE.animation,
}: FilmsCatalogPendingShellProps) {
  const isLiveAction =
    showLiveActionTab && mediaType === MEDIA_TYPE.liveAction;
  const animationNav = headerNavLabelCollapse(!isLiveAction);
  const filmsNav = headerNavLabelCollapse(isLiveAction);
  const savedNav = headerNavLabelCollapse(false);
  const watchedNav = headerNavLabelCollapse(false);

  const hero = isLiveAction
    ? {
        title: "Indie & Festival Films",
        subtitle:
          "Find distinctive, beautiful and emotionally resonant films to watch next.",
      }
    : {
        title: RESONALE_BRAND_TAGLINE,
        subtitle:
          "Discover strange, beautiful and emotionally resonant animated films to watch next.",
      };

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      aria-busy="true"
      aria-label="Loading catalog"
      data-testid="films-catalog-pending"
    >
      <header className="mb-0">
        <div className="flex flex-nowrap items-center justify-between gap-1 sm:gap-3">
          <ResonaleBrand showTagline={!showSubtitle} />

          <nav
            aria-label="Catalog and lists"
            className="flex shrink-0 items-center gap-0 sm:gap-2 md:gap-3"
          >
            <HeaderIconLink
              label="Animation"
              href="/"
              active={!isLiveAction}
              labelClassName={animationNav.labelClassName}
              iconActiveClassName={animationNav.iconActiveClassName}
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
            {showLiveActionTab ? (
              <HeaderIconLink
                label="Films"
                href="/?media=live_action"
                active={isLiveAction}
                labelClassName={filmsNav.labelClassName}
                iconActiveClassName={filmsNav.iconActiveClassName}
                data-testid="nav-films"
              >
                <Clapperboard
                  size={HEADER_NAV_ICON.size}
                  strokeWidth={HEADER_NAV_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconLink>
            ) : null}
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
                email={auth.viewAs?.email ?? auth.email}
                profileName={auth.profile?.name ?? null}
              />
            ) : (
              <AccountMenu loginHref="/login" />
            )}
          </nav>
        </div>

        {showSubtitle ? null : <h1 className="sr-only">Resonale</h1>}
      </header>

      {showSubtitle ? (
        <div className="mt-0">
          <CatalogHeroBanner title={hero.title} subtitle={hero.subtitle} />
          <SkeletonBlock className="mb-6 mt-4 h-4 w-40" />
          <SkeletonBlock className="mb-6 h-12 w-full rounded-full" />
        </div>
      ) : (
        <>
          <SkeletonBlock className="mb-6 mt-[18px] h-4 w-40" />
          <SkeletonBlock className="mb-6 h-12 w-full rounded-full" />
        </>
      )}

      <section className="grid gap-4">
        <FilmCardSkeleton />
        <FilmCardSkeleton />
        <FilmCardSkeleton />
      </section>
    </main>
  );
}
