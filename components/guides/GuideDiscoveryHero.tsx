import Link from "next/link";
import { guideDisplayFont as guideDiscoveryDisplayFont } from "@/components/guides/guide-display-font";

export { guideDiscoveryDisplayFont };

export type GuideDiscoveryDoor = {
  label: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
};

export type GuideDiscoveryHeroContent = {
  h1: string;
  deck: string | string[];
  prompt?: string;
  heroImageSrc?: string;
  heroImageAlt?: string;
  doors: GuideDiscoveryDoor[];
};

type GuideDiscoveryHeroProps = {
  content: GuideDiscoveryHeroContent;
  sectionLink: { href: string; label: string };
};

export default function GuideDiscoveryHero({
  content,
  sectionLink,
}: GuideDiscoveryHeroProps) {
  return (
    <div
      data-testid="guide-discovery-hero"
      className={guideDiscoveryDisplayFont.variable}
    >
      <Link
        href={sectionLink.href}
        data-testid="guide-section-link"
        className="font-sans text-[13px] tracking-wide text-[#8a857c] transition hover:text-[#2f2c28]"
      >
        {sectionLink.label}
      </Link>

      <div className="mt-4">
        <h1
          className={`${guideDiscoveryDisplayFont.className} text-[1.85rem] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1c1916] sm:text-[2.15rem] md:whitespace-nowrap lg:text-[2.45rem]`}
        >
          {content.h1}
        </h1>
        <div className="mt-3 max-w-[58rem] space-y-3">
          {(Array.isArray(content.deck) ? content.deck : [content.deck]).map(
            (paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="font-sans text-[16px] font-normal leading-[1.65] text-[#4a4b5c] antialiased [font-synthesis:none]"
              >
                {paragraph}
              </p>
            )
          )}
        </div>
        {content.prompt ? (
          <p className="mt-4 inline-flex max-w-full">
            <span
              data-testid="guide-discovery-prompt"
              className="relative inline-block px-4 py-1.5 text-[1rem] font-medium italic leading-snug text-[#2a2420] sm:px-5 sm:text-[1.08rem]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -skew-x-2 bg-[#e8d5c8]/[0.92]"
                style={{
                  borderRadius: "40% 60% 55% 45% / 55% 45% 60% 40%",
                }}
              />
              <span className="relative">{content.prompt}</span>
            </span>
          </p>
        ) : null}
      </div>

      <nav
        aria-label="Ways into animation"
        className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:mt-9 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 md:gap-x-3 lg:gap-x-3"
      >
        {content.doors.map((door) => (
          <Link
            key={door.href + door.label}
            href={door.href}
            data-testid="guide-discovery-door"
            className="group flex min-w-0 flex-col items-center text-center"
          >
            <span className="block w-full max-w-[6.75rem] overflow-hidden rounded-t-full rounded-b-[0.95rem] bg-[#ebe6dd] shadow-[0_10px_22px_-18px_rgba(40,32,24,0.5)] transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_28px_-16px_rgba(40,32,24,0.55)] sm:max-w-[7.5rem]">
              <span className="block aspect-[3/4] w-full">
                <img
                  src={door.imageSrc}
                  alt={door.imageAlt}
                  width={240}
                  height={320}
                  decoding="async"
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              </span>
            </span>
            <span
              className={`${guideDiscoveryDisplayFont.className} mt-2 flex items-baseline justify-center gap-1 px-0.5 text-[0.88rem] font-medium leading-snug text-[#1c1916] sm:text-[0.95rem]`}
            >
              <span>{door.label}</span>
              <span
                aria-hidden="true"
                className="translate-y-px text-[0.85em] text-[#8a857c] transition group-hover:translate-x-0.5 group-hover:text-[#1c1916]"
              >
                →
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
