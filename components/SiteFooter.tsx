import Link from "next/link";
import { PRIVACY_PATH } from "@/lib/legal/privacy";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[#eceef5] pt-5 pb-2">
      <nav aria-label="Legal">
        <Link
          href={PRIVACY_PATH}
          className="text-sm text-[#7a7b90] transition hover:text-[#2f3040]"
          data-testid="privacy-policy-link"
        >
          Privacy Policy
        </Link>
      </nav>
    </footer>
  );
}
