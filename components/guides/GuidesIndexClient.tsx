"use client";

import Link from "next/link";
import EmailAuthModal from "@/components/EmailAuthModal";
import GuideSectionHeader from "@/components/guides/GuideSectionHeader";
import SiteFooter from "@/components/SiteFooter";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";
import {
  GUIDES_INDEX_PATH,
  PUBLIC_GUIDE_LINKS,
} from "@/lib/guides/public-guide-links.mjs";
import { useCatalogFilmInteraction } from "@/lib/use-catalog-film-interaction";
import type { AuthUserSummary } from "@/lib/auth/session";

const INTRO =
  "Curated lists of independent and festival animation, for when you want a distinctive film to watch next.";

type GuidesIndexClientProps = {
  auth: AuthUserSummary | null;
};

export default function GuidesIndexClient({
  auth: initialAuth,
}: GuidesIndexClientProps) {
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
    postAuthPath: GUIDES_INDEX_PATH,
  });

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      data-testid="guides-index"
    >
      <GuideSectionHeader
        auth={auth}
        authTriggerRef={authTriggerRef}
        openAuthModal={openAuthModal}
      />

      <div className="mt-10 mb-8 sm:mt-12 sm:mb-10">
        <h1 className="font-sans text-[28px] font-medium leading-[1.2] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[32px]">
          Guides to Animated Films
        </h1>
        <p
          className={`mt-4 font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none] ${GUIDE_PROSE_CLASS}`}
        >
          {INTRO}
        </p>
      </div>

      <ul className="grid gap-8">
        {PUBLIC_GUIDE_LINKS.map((guide) => (
          <li key={guide.href} className={GUIDE_PROSE_CLASS}>
            <h2 className="font-sans text-[22px] font-medium leading-[1.25] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[24px]">
              <Link
                href={guide.href}
                data-testid={`guides-index-${guide.slug}`}
                className="underline decoration-[#c5c2d6] underline-offset-4 hover:text-[#1A1B2E] hover:decoration-[#1A1B2E]"
              >
                {guide.title}
              </Link>
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-[#4a4b5c]">
              {guide.description}
            </p>
          </li>
        ))}
      </ul>

      <SiteFooter />

      <EmailAuthModal
        open={modalOpen}
        onClose={handleModalClose}
        postAuthPath={GUIDES_INDEX_PATH}
        lockScrollY={modalLockScrollY}
        restoreFocusElement={modalRestoreFocusElement}
      />
    </main>
  );
}
