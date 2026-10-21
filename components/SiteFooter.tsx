import Link from "next/link";
import LegalLinks from "@/components/LegalLinks";
import { FESTIVALS_INDEX_PATH } from "@/lib/festivals/public-festival-paths.mjs";
import { GUIDES_INDEX_PATH } from "@/lib/guides/public-guide-links.mjs";

const FOOTER_LINK_CLASS =
  "text-sm text-[#7a7b90] transition hover:text-[#2f3040]";

type SiteFooterProps = {
  catalogUpdatedLabel?: string | null;
};

export default function SiteFooter({
  catalogUpdatedLabel = null,
}: SiteFooterProps) {
  return (
    <footer className="mt-16 border-t border-[#eceef5] pt-5 pb-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link
            href={GUIDES_INDEX_PATH}
            className={FOOTER_LINK_CLASS}
            data-testid="footer-guides-link"
          >
            Guides
          </Link>
          <Link
            href={FESTIVALS_INDEX_PATH}
            className={FOOTER_LINK_CLASS}
            data-testid="footer-festivals-link"
          >
            Festivals
          </Link>
          <LegalLinks
            className="flex flex-wrap gap-x-5 gap-y-2"
            linkClassName={FOOTER_LINK_CLASS}
            privacyTestId="privacy-policy-link"
            contactTestId="contact-page-link"
          />
        </div>
        {catalogUpdatedLabel ? (
          <p
            className="shrink-0 font-sans text-sm font-normal leading-none tracking-tight text-[#7a7b90] antialiased [font-synthesis:none]"
            data-testid="footer-catalog-updated"
          >
            {catalogUpdatedLabel}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
