import { Cormorant_Garamond } from "next/font/google";

/** Shared display face for guide / festival document titles and section headings. */
export const guideDisplayFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-guide-discovery",
});

export const GUIDE_DISPLAY_H1_CLASS = `${guideDisplayFont.className} mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.015em] text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[34px]`;

export const GUIDE_DISPLAY_H1_COLLAGE_CLASS = `${guideDisplayFont.className} mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.015em] text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[34px] lg:text-[38px]`;

export const GUIDE_DISPLAY_H2_CLASS = `${guideDisplayFont.className} text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[24px]`;
