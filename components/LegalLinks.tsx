import Link from "next/link";
import { CONTACT_PATH } from "@/lib/legal/contact";
import { PRIVACY_PATH } from "@/lib/legal/privacy";

type LegalLinksProps = {
  className?: string;
  linkClassName: string;
  privacyTestId: string;
  contactTestId: string;
};

export default function LegalLinks({
  className,
  linkClassName,
  privacyTestId,
  contactTestId,
}: LegalLinksProps) {
  return (
    <nav aria-label="Legal" className={className}>
      <Link href={PRIVACY_PATH} className={linkClassName} data-testid={privacyTestId}>
        Privacy Policy
      </Link>
      <Link href={CONTACT_PATH} className={linkClassName} data-testid={contactTestId}>
        Contact
      </Link>
    </nav>
  );
}
