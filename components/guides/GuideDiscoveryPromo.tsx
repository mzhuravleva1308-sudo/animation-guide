import Link from "next/link";
import { guideDiscoveryDisplayFont } from "@/components/guides/GuideDiscoveryHero";
import { markScrollHomeToTop } from "@/lib/scroll-home-to-top";

export type GuideDiscoveryPromoContent = {
  eyebrow: string;
  heading: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
  imageSrc: string;
  imageAlt: string;
};

type GuideDiscoveryPromoProps = {
  content: GuideDiscoveryPromoContent;
};

export default function GuideDiscoveryPromo({ content }: GuideDiscoveryPromoProps) {
  return (
    <section
      data-testid="guide-discovery-promo"
      className={`${guideDiscoveryDisplayFont.variable} relative mt-16 overflow-hidden rounded-[1.75rem] bg-[#f1e8dc] shadow-[0_12px_36px_-18px_rgba(48,36,24,0.28)]`}
    >
      {/* One cream field: art lives in the same plane and bleeds toward the copy. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] select-none opacity-[0.86] md:block lg:w-[58%]"
      >
        <img
          src={content.imageSrc}
          alt=""
          width={1024}
          height={512}
          decoding="async"
          loading="lazy"
          className="h-full w-full scale-[1.08] object-contain object-[72%_center] brightness-[1] contrast-[0.96] saturate-[0.88] lg:scale-[1.12] lg:object-[78%_center]"
        />
      </div>

      <div className="relative z-10 grid items-center md:min-h-[22rem] lg:min-h-[24rem]">
        <div className="max-w-[34rem] px-6 py-8 sm:px-8 sm:py-9 md:max-w-[min(100%,28.5rem)] md:px-9 md:py-10 lg:max-w-[30rem] lg:px-11 lg:py-11">
          <p className="font-sans text-[11px] font-semibold tracking-[0.18em] text-[#8a6b52] uppercase">
            {content.eyebrow}
          </p>
          <h2
            className={`${guideDiscoveryDisplayFont.className} mt-3 max-w-[15ch] text-[1.85rem] font-semibold leading-[1.12] tracking-[-0.02em] text-[#1c1916] sm:text-[2.15rem]`}
          >
            {content.heading}
          </h2>
          <p className="mt-4 font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]">
            {content.body}
          </p>
          <Link
            href={content.ctaHref}
            data-testid="guide-cta"
            scroll
            onClick={() => {
              markScrollHomeToTop();
              window.scrollTo(0, 0);
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2a2622] px-5 py-2.5 font-sans text-[14px] font-medium text-[#f7f2ea] transition hover:bg-[#1c1916]"
          >
            <span>{content.ctaLabel}</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <div className="px-4 pb-7 opacity-[0.86] md:hidden">
          <img
            src={content.imageSrc}
            alt={content.imageAlt}
            width={1024}
            height={512}
            decoding="async"
            loading="lazy"
            className="h-auto w-full object-contain brightness-[1] contrast-[0.96] saturate-[0.88]"
          />
        </div>
      </div>

      {/* Desktop-accessible alt for the decorative absolute image */}
      <span className="sr-only">{content.imageAlt}</span>
    </section>
  );
}
