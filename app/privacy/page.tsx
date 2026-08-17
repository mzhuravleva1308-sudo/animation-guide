import type { Metadata } from "next";
import Link from "next/link";
import ResonaleBrand from "@/components/ResonaleBrand";
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_LAST_UPDATED,
  PRIVACY_PATH,
} from "@/lib/legal/privacy";
import { PUBLIC_SITE_ORIGIN } from "@/lib/public-site-origin";

const TITLE = "Privacy Policy | Resonale";
const DESCRIPTION =
  "How Resonale collects, uses, and stores the data needed to sign you in and remember your film taste.";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: PRIVACY_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PRIVACY_PATH,
    siteName: "Resonale",
    type: "website",
  },
};

const sectionTitleClassName =
  "mt-10 font-sans text-[18px] font-medium tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none]";
const bodyClassName =
  "mt-3 font-sans text-[15px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]";
const listClassName = `${bodyClassName} list-disc space-y-1 pl-5`;

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8">
      <header>
        <ResonaleBrand />
      </header>

      <article className="mt-10 max-w-[42rem] sm:mt-12" data-testid="privacy-policy">
        <h1 className="font-sans text-[28px] font-medium leading-[1.2] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[32px]">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-[#7a7b90]">
          Last updated: {PRIVACY_LAST_UPDATED}
        </p>

        <p className={bodyClassName}>
          Resonale is an animation and film guide at{" "}
          <a
            href={PUBLIC_SITE_ORIGIN}
            className="underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E]"
          >
            resonale.com
          </a>
          . This page describes the personal data we collect when you use the
          site, and why.
        </p>

        <h2 className={sectionTitleClassName}>What we collect</h2>
        <ul className={listClassName}>
          <li>
            <strong className="font-medium text-[#2f3040]">Account data.</strong>{" "}
            Your email address and sign-in identifiers. If you use Apple or
            Google, we receive the name and email those services share with us
            (including a Hide My Email relay address, if you choose one).
          </li>
          <li>
            <strong className="font-medium text-[#2f3040]">Guide data.</strong>{" "}
            Ratings, saved films, watched films, and an optional taste profile
            generated from your ratings.
          </li>
          <li>
            <strong className="font-medium text-[#2f3040]">
              Technical data.
            </strong>{" "}
            Session cookies, a short-lived post-login redirect cookie, and
            on-device storage for pending ratings or saves before you sign in.
            We also keep activity records of rating and save actions, which may
            include browser user agent.
          </li>
        </ul>
        <p className={bodyClassName}>
          You can browse the public catalog without an account. We do not use
          advertising cookies or third-party analytics.
        </p>

        <h2 className={sectionTitleClassName}>How we use it</h2>
        <ul className={listClassName}>
          <li>Create and keep your signed-in session.</li>
          <li>Save your lists and rank films for your taste.</li>
          <li>
            Send transactional sign-in emails (magic links). We do not send
            marketing email.
          </li>
          <li>Operate, secure, and debug the service.</li>
        </ul>

        <h2 className={sectionTitleClassName}>Processors</h2>
        <p className={bodyClassName}>
          We use other companies to run Resonale. They process data only to
          provide their service to us:
        </p>
        <ul className={listClassName}>
          <li>
            <strong className="font-medium text-[#2f3040]">Supabase</strong> —
            authentication, database, and delivery of sign-in emails.
          </li>
          <li>
            <strong className="font-medium text-[#2f3040]">Vercel</strong> —
            hosting and server logs.
          </li>
          <li>
            <strong className="font-medium text-[#2f3040]">OpenAI</strong> — if
            you generate a taste profile, we send your display name and rated
            film details (titles, ratings, and catalog metadata) to produce that
            text. We do not send your email address for this.
          </li>
          <li>
            <strong className="font-medium text-[#2f3040]">Apple or Google</strong>{" "}
            — only if you choose to sign in with them.
          </li>
        </ul>
        <p className={bodyClassName}>
          Some of these processors are outside the European Economic Area. We
          do not sell your personal data.
        </p>

        <h2 className={sectionTitleClassName}>Cookies and local storage</h2>
        <p className={bodyClassName}>
          Essential cookies keep you signed in and remember where to return
          after a magic-link sign-in. Local storage may hold a pending save or
          rating until you finish signing in, and whether you dismissed rating
          hints. These are needed for the site to work; there is no advertising
          cookie banner because we do not use non-essential tracking cookies.
        </p>

        <h2 className={sectionTitleClassName}>How long we keep it</h2>
        <p className={bodyClassName}>
          Account and guide data stay until you ask us to delete them, or until
          we close the service. Hosting and auth logs are kept only as long as
          needed to operate and secure Resonale.
        </p>

        <h2 className={sectionTitleClassName}>Your choices</h2>
        <p className={bodyClassName}>
          You can change ratings and lists in the app, and log out at any time.
          You may also ask us to access, correct, or delete your account and
          related data. To do that, email{" "}
          <a
            href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
            className="underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E]"
            data-testid="privacy-contact-email"
          >
            {PRIVACY_CONTACT_EMAIL}
          </a>
          . There is no in-app account deletion yet.
        </p>

        <h2 className={sectionTitleClassName}>Children</h2>
        <p className={bodyClassName}>
          Resonale is not directed at children under 16, and we do not
          knowingly collect personal data from them.
        </p>

        <h2 className={sectionTitleClassName}>Changes</h2>
        <p className={bodyClassName}>
          If this policy changes, we will update this page and the date above.
        </p>

        <h2 className={sectionTitleClassName}>Contact</h2>
        <p className={bodyClassName}>
          Privacy questions:{" "}
          <a
            href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
            className="underline decoration-[#c5c2d6] underline-offset-2 hover:text-[#1A1B2E]"
          >
            {PRIVACY_CONTACT_EMAIL}
          </a>
          . The operator of Resonale is the controller of this data.
        </p>

        <p className={`${bodyClassName} mt-10`}>
          <Link
            href="/"
            className="text-sm text-[#7a7b90] transition hover:text-[#2f3040]"
          >
            Back to Resonale
          </Link>
        </p>
      </article>
    </main>
  );
}
