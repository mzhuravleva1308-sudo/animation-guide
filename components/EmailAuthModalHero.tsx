import { Bookmark, Compass, Star } from "lucide-react";
import type { AuthModalReason } from "@/lib/auth/auth-modal-copy";

type EmailAuthModalHeroProps = {
  reason: AuthModalReason;
  filmTitle?: string | null;
  rating?: number | null;
};

const iconShellClassName =
  "inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f0fb] text-[#6b5bb8]";

export default function EmailAuthModalHero({
  reason,
  filmTitle = null,
  rating = null,
}: EmailAuthModalHeroProps) {
  if (reason === "rating") {
    if (typeof rating === "number") {
      const title = filmTitle?.trim() || "This film";

      return (
        <div
          className="inline-flex max-w-full items-center rounded-full bg-[#f5f3f7] px-3.5 py-2 text-[13px] font-medium leading-none tracking-tight text-[#1A1B2E]"
          data-testid="email-auth-modal-hero"
          data-hero="rating"
          aria-label={`${title}: ${rating} out of 10`}
        >
          <span className="truncate">{title}</span>
          <span className="mx-1.5 shrink-0 text-[#9a9baf]" aria-hidden="true">
            •
          </span>
          <span className="shrink-0 tabular-nums">
            {rating}
            <span className="text-[#7a7b90]">/10</span>
          </span>
        </div>
      );
    }

    return (
      <div
        className={iconShellClassName}
        data-testid="email-auth-modal-hero"
        data-hero="rating"
        aria-hidden="true"
      >
        <Star className="h-5 w-5" strokeWidth={1.75} />
      </div>
    );
  }

  if (reason === "save" || reason === "saved_tab") {
    return (
      <div
        className={iconShellClassName}
        data-testid="email-auth-modal-hero"
        data-hero="save"
        aria-hidden="true"
      >
        <Bookmark className="h-5 w-5" strokeWidth={1.75} />
      </div>
    );
  }

  if (reason === "vibe_search") {
    return (
      <div
        className={iconShellClassName}
        data-testid="email-auth-modal-hero"
        data-hero="vibe_search"
        aria-hidden="true"
      >
        <Compass className="h-5 w-5" strokeWidth={1.75} />
      </div>
    );
  }

  return null;
}
