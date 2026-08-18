import Link from "next/link";
import LegalLinks from "@/components/LegalLinks";
import { GUIDES_INDEX_PATH } from "@/lib/guides/public-guide-links.mjs";

const FOOTER_LINK_CLASS =
  "text-sm text-[#7a7b90] transition hover:text-[#2f3040]";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[#eceef5] pt-5 pb-2">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link
          href={GUIDES_INDEX_PATH}
          className={FOOTER_LINK_CLASS}
          data-testid="footer-guides-link"
        >
          Guides
        </Link>
        <LegalLinks
          className="flex flex-wrap gap-x-5 gap-y-2"
          linkClassName={FOOTER_LINK_CLASS}
          privacyTestId="privacy-policy-link"
          contactTestId="contact-page-link"
        />
      </div>
    </footer>
  );
}
