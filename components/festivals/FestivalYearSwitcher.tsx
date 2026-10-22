import Link from "next/link";

export type FestivalYearOption = {
  year: number;
  href: string;
};

type FestivalYearSwitcherProps = {
  years: FestivalYearOption[];
  activeYear: number;
};

export default function FestivalYearSwitcher({
  years,
  activeYear,
}: FestivalYearSwitcherProps) {
  return (
    <nav
      aria-label="Festival year"
      data-testid="festival-year-switcher"
      className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      {years.map((option) => {
        const isActive = option.year === activeYear;
        return (
          <Link
            key={option.year}
            href={option.href}
            data-testid={`festival-year-${option.year}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "font-sans text-sm font-medium text-[#1A1B2E] antialiased [font-synthesis:none]"
                : "font-sans text-sm font-normal text-[#7a7b90] underline decoration-[#c5c2d6] underline-offset-2 transition hover:text-[#1A1B2E] hover:decoration-[#1A1B2E] antialiased [font-synthesis:none]"
            }
          >
            {option.year}
          </Link>
        );
      })}
    </nav>
  );
}
