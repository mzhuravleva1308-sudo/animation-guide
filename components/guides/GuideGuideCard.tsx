import Link from "next/link";

export type GuideGuideCardItem = {
  kind: "guideCard";
  href: string;
  label: string;
  blurb: string | null;
  imageSrc: string;
  imageAlt: string;
  ctaLabel: string;
};

type GuideGuideCardProps = {
  item: GuideGuideCardItem;
};

export default function GuideGuideCard({ item }: GuideGuideCardProps) {
  return (
    <Link
      href={item.href}
      data-testid="guide-guide-card"
      className="group flex min-w-0 flex-col"
    >
      <span className="block overflow-hidden rounded-[1rem] bg-[#ece7de] sm:rounded-[1.15rem]">
        <span className="block aspect-[4/3] w-full">
          <img
            src={item.imageSrc}
            alt={item.imageAlt}
            width={800}
            height={600}
            decoding="async"
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          />
        </span>
      </span>
      <span className="mt-2 font-sans text-[14px] font-medium leading-snug tracking-tight text-[#5c5d6e] antialiased [font-synthesis:none] transition group-hover:text-[#1A1B2E] sm:text-[15px]">
        {item.label}
      </span>
    </Link>
  );
}
