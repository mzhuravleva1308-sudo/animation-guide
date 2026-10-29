"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RESONALE_BRAND_TAGLINE,
  RESONALE_NAVY,
} from "@/components/ResonaleBrand";

type CatalogHeroBannerProps = {
  /** Visible H1 — defaults to the Resonale brand tagline. */
  title?: string;
  subtitle: string;
  /**
   * Search / AI Search — shown under the subtitle on phone when the subtitle
   * still fits in 1–2 lines (≤575px).
   */
  topControls?: ReactNode;
  /** True when topControls should sit in the hero (parent hides the duplicate). */
  onKeepSearchUpChange?: (keepSearchUp: boolean) => void;
};

/** Phone layout for hero art — not Tailwind `sm` (640). */
const MOBILE_MQ = "(max-width: 575px)";

function countLines(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return 1;
  }
  // Round with a small tolerance so sub-pixel wrap doesn't flip 2↔3.
  return Math.max(
    1,
    Math.round(element.getBoundingClientRect().height / lineHeight)
  );
}

/**
 * Homepage catalog hero: large title + subtitle over the pastel mountain art.
 *
 * ≤575px: art when subtitle is 1–2 lines; search stays up with the title.
 * Hide art (and drop search below) when subtitle wraps to 3+ lines.
 */
export default function CatalogHeroBanner({
  title = RESONALE_BRAND_TAGLINE,
  subtitle,
  topControls,
  onKeepSearchUpChange,
}: CatalogHeroBannerProps) {
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [subtitleLines, setSubtitleLines] = useState(1);

  useLayoutEffect(() => {
    const media = window.matchMedia(MOBILE_MQ);

    function syncMobile() {
      setIsMobile(media.matches);
    }

    syncMobile();
    media.addEventListener("change", syncMobile);
    return () => media.removeEventListener("change", syncMobile);
  }, []);

  useLayoutEffect(() => {
    const element = subtitleRef.current;
    if (!element) {
      return;
    }

    function measure() {
      if (!subtitleRef.current) {
        return;
      }
      setSubtitleLines(countLines(subtitleRef.current));
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [subtitle, title]);

  const keepSearchUp = isMobile && subtitleLines <= 2;
  const showArt = !isMobile || subtitleLines <= 2;

  useLayoutEffect(() => {
    onKeepSearchUpChange?.(keepSearchUp);
  }, [keepSearchUp, onKeepSearchUpChange]);

  return (
    <div
      className={`relative mt-[18px] mb-5 sm:mb-6 ${
        showArt
          ? keepSearchUp
            ? "max-[575px]:min-h-[180px] max-[575px]:overflow-hidden"
            : "max-[575px]:min-h-[120px] max-[575px]:overflow-hidden"
          : ""
      }`}
      data-testid="catalog-hero-banner"
      data-hero-art={showArt ? "on" : "off"}
      data-subtitle-lines={subtitleLines}
      data-search-up={keepSearchUp ? "on" : "off"}
    >
      {showArt ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[-8px] right-0 left-0 z-0 max-[575px]:bottom-0 min-[576px]:top-[-12px] min-[576px]:h-[180px] md:h-[200px]"
          style={{
            WebkitMaskImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.45) 18%, #000 40%)",
            maskImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.45) 18%, #000 40%)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-backdrop.png?v=original"
            alt=""
            width={2172}
            height={724}
            decoding="async"
            className="h-full w-full select-none object-cover object-right grayscale-[45%] contrast-[0.96] saturate-[0.85]"
          />
        </div>
      ) : null}

      <div className="relative z-40">
        <div className="max-w-fit">
          <h1
            className="font-sans text-[22px] font-semibold leading-[1.08] tracking-tight antialiased [font-synthesis:none] sm:whitespace-nowrap sm:text-[28px] md:text-[30px]"
            style={{ color: RESONALE_NAVY }}
          >
            {title}
          </h1>
          <p
            ref={subtitleRef}
            className="mt-2 max-w-xl font-sans text-[14px] font-normal leading-snug tracking-tight text-[#6b7280] antialiased [font-synthesis:none] sm:text-[15px]"
          >
            {subtitle}
          </p>
        </div>
        {keepSearchUp && topControls ? (
          <div className="mt-3">{topControls}</div>
        ) : null}
      </div>
    </div>
  );
}
