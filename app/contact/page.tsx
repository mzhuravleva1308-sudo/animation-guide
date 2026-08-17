import type { Metadata } from "next";
import Link from "next/link";
import ResonaleBrand from "@/components/ResonaleBrand";
import SiteFooter from "@/components/SiteFooter";
import { CONTACT_EMAIL, CONTACT_PATH } from "@/lib/legal/contact";
import { PRIVACY_CONTACT_EMAIL, PRIVACY_PATH } from "@/lib/legal/privacy";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

const TITLE = "Contact | Resonale";
const DESCRIPTION =
  "Email Resonale about the guide, your account, or a privacy request.";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: CONTACT_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CONTACT_PATH,
    siteName: "Resonale",
    type: "website",
  },
};

const bodyClassName =
  "mt-3 font-sans text-[15px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]";
const emailLinkClassName =
  "underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E]";

export default function ContactPage() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8">
      <header>
        <ResonaleBrand />
      </header>

      <article className="mt-10 max-w-[42rem] sm:mt-12" data-testid="contact-page">
        <h1 className="font-sans text-[28px] font-medium leading-[1.2] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[32px]">
          Contact
        </h1>
        <p className={bodyClassName}>
          Email is the best way to reach Resonale. There is no phone line or
          chat.
        </p>

        <p className={bodyClassName}>
          General questions, catalog notes, and account help:{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={emailLinkClassName}
            data-testid="contact-email"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>

        <p className={bodyClassName}>
          Privacy requests (access, correction, or deletion):{" "}
          <a
            href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
            className={emailLinkClassName}
            data-testid="contact-privacy-email"
          >
            {PRIVACY_CONTACT_EMAIL}
          </a>
          . See the{" "}
          <Link href={PRIVACY_PATH} className={emailLinkClassName}>
            Privacy Policy
          </Link>{" "}
          for what we collect.
        </p>
      </article>

      <div className="max-w-[42rem]">
        <SiteFooter />
      </div>
    </main>
  );
}
