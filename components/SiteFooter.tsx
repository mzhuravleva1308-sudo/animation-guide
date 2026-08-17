import LegalLinks from "@/components/LegalLinks";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[#eceef5] pt-5 pb-2">
      <LegalLinks
        className="flex flex-wrap gap-x-5 gap-y-2"
        linkClassName="text-sm text-[#7a7b90] transition hover:text-[#2f3040]"
        privacyTestId="privacy-policy-link"
        contactTestId="contact-page-link"
      />
    </footer>
  );
}
