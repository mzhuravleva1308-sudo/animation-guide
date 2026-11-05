"use client";

import { useLayoutEffect, useState } from "react";
import {
  Bookmark,
  CircleCheck,
  Clapperboard,
  Film as FilmIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import FilmCatalog from "@/components/FilmCatalog";
import {
  HeaderIconLink,
  HEADER_NAV_ICON,
  headerNavLabelCollapse,
} from "@/components/HeaderIconControl";
import ResonaleBrand, {
  RESONALE_BRAND_TAGLINE,
} from "@/components/ResonaleBrand";
import type { QuickFilter } from "@/components/QuickFilters";
import type { AuthUserSummary } from "@/lib/auth/session";
import { MEDIA_TYPE, type MediaType } from "@/lib/media-type";
import { peekScrollHomeToTop } from "@/lib/scroll-home-to-top";
import { canAccessVibeSearch } from "@/lib/vibe-search-access.mjs";

/** Match PUBLIC_CATALOG_PAGE_SIZE without importing the server catalog loader. */
const PENDING_CATALOG_PAGE_SIZE = 24;

type FilmsCatalogPendingShellProps = {
  auth?: AuthUserSummary | null;
  showLiveActionTab?: boolean;
  /** Homepage shows the catalog hero under the brand row. */
  showSubtitle?: boolean;
  mediaType?: MediaType;
  initialQuickFilter?: QuickFilter;
};

/**
 * Instant catalog chrome while film cards stream in.
 * Must stay a different component type than FilmsPageClient — soft nav from
 * guides reused FilmsPageClient+catalogPending and never swapped in cards.
 */
export default function FilmsCatalogPendingShell({
  auth = null,
  showLiveActionTab = false,
  showSubtitle = false,
  mediaType = MEDIA_TYPE.animation,
  initialQuickFilter = null,
}: FilmsCatalogPendingShellProps) {
  const [activeQuickFilter, setActiveQuickFilter] =
    useState<QuickFilter>(initialQuickFilter);

  useLayoutEffect(() => {
    if (peekScrollHomeToTop()) {
      window.scrollTo(0, 0);
    }
  }, []);

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

      <div className={showSubtitle ? undefined : "mt-[18px]"}>
        <FilmCatalog
          films={[]}
          awardWinningFilmIds={[]}
          pageSize={PENDING_CATALOG_PAGE_SIZE}
          loadError={null}
          mediaType={mediaType}
          activeQuickFilter={activeQuickFilter}
          onQuickFilterChange={setActiveQuickFilter}
          showVibeSearch
          vibeSearchUnlocked={canAccessVibeSearch(auth?.email)}
          showArchive={Boolean(auth)}
          filmsPending
          hero={
            showSubtitle
              ? { title: hero.title, subtitle: hero.subtitle }
              : null
          }
        />
      </div>
    </main>
  );
}
