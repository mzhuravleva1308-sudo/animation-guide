"use client";

import Link from "next/link";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";

export type GuideGuidePreviewItem = {
  kind: "guidePreview";
  href: string;
  label: string;
  blurb: string | null;
  posters: { title: string; posterUrl: string | null }[];
};

type GuideGuidePreviewProps = {
  item: GuideGuidePreviewItem;
};

export default function GuideGuidePreview({ item }: GuideGuidePreviewProps) {
  return (
    <Link
      href={item.href}
      data-testid="guide-guide-preview"
      className="group block rounded-2xl border border-[#e6e5ef] bg-[#fafafc] p-4 transition-colors hover:border-[#c5c2d6] hover:bg-white sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-[15px] font-medium leading-snug tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] underline decoration-[#c5c2d6] underline-offset-4 group-hover:decoration-[#1A1B2E]">
            {item.label}
          </p>
          {item.blurb ? (
            <p
              className={`mt-2 text-[15px] leading-[1.55] text-[#4a4b5c] ${GUIDE_PROSE_CLASS}`}
            >
              {item.blurb}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-[13px] font-medium text-[#7a7890] group-hover:text-[#1A1B2E]">
          Read the guide →
        </span>
      </div>
      <ul className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {item.posters.map((poster, index) => (
          <li
            key={poster.title}
            className="aspect-[2/3] w-[88px] shrink-0 overflow-hidden rounded-xl bg-[#eeeef4] sm:w-[104px]"
            aria-hidden="true"
          >
            {poster.posterUrl ? (
              <img
                src={poster.posterUrl}
                alt=""
                width={104}
                height={156}
                decoding="async"
                loading={index === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover"
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Link>
  );
}
