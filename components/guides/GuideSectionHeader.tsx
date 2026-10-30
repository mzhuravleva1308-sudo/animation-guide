"use client";

import {
  Bookmark,
  CircleCheck,
  Film as FilmIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import {
  HeaderIconLink,
  HEADER_NAV_ICON,
  headerNavLabelCollapse,
} from "@/components/HeaderIconControl";
import ResonaleBrand from "@/components/ResonaleBrand";
import type { AuthUserSummary } from "@/lib/auth/session";
import type { RefObject } from "react";

type GuideSectionHeaderProps = {
  auth: AuthUserSummary | null;
  authTriggerRef: RefObject<HTMLButtonElement | null>;
  openAuthModal: (restoreFocus?: HTMLElement | null) => void;
};

export default function GuideSectionHeader({
  auth,
  authTriggerRef,
  openAuthModal,
}: GuideSectionHeaderProps) {
  const animationNav = headerNavLabelCollapse(false);
  const savedNav = headerNavLabelCollapse(false);
  const watchedNav = headerNavLabelCollapse(false);

  return (
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
            <AccountMenu
              triggerRef={authTriggerRef}
              onLogin={() => openAuthModal(authTriggerRef.current)}
            />
          )}
        </nav>
      </div>
    </header>
  );
}
