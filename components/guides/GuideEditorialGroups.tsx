"use client";

import FilmCard from "@/components/FilmCard";
import GuideFilmEngageTracker from "@/components/guides/GuideFilmEngageTracker";
import GuideGuidePreview, {
  type GuideGuidePreviewItem,
} from "@/components/guides/GuideGuidePreview";
import GuideProseText from "@/components/guides/GuideProseText";
import GuideShortFilmRow, {
  type GuideShortFilmItem,
} from "@/components/guides/GuideShortFilmRow";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";
import { useRatingOnboarding } from "@/lib/use-rating-onboarding";
import { MEDIA_TYPE } from "@/lib/media-type";
import type { AuthRequiredAction } from "@/lib/auth/auth-modal-copy";
import { Film } from "@/types/film";

export type GuideEditorialCatalogItem = {
  kind?: "catalog";
  film: Film;
  note?: string | null;
  awards?: string | null;
};

export type GuideEditorialProseItem = {
  kind: "prose";
  text: string;
};

export type GuideEditorialItem =
  | GuideEditorialCatalogItem
  | GuideShortFilmItem
  | GuideEditorialProseItem
  | GuideGuidePreviewItem;

export type GuideEditorialGroup = {
  heading: string;
  description?: string;
  items: GuideEditorialItem[];
};

type GuideEditorialGroupsProps = {
  groups: GuideEditorialGroup[];
  profileId?: string;
  profileSlug?: string;
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number | null>;
  ratingsReady: boolean;
  hideFestivalBadges?: boolean;
  onSavedChange: (film: Film, saved: boolean) => void;
  onRatingChange: (
    filmId: string,
    rating: number | null,
    options?: { skipOrderUpdate?: boolean }
  ) => void;
  onAuthRequired?: (action: AuthRequiredAction) => void;
  currentGuidePath?: string;
};

function isShortItem(item: GuideEditorialItem): item is GuideShortFilmItem {
  return item.kind === "short";
}

function isProseItem(item: GuideEditorialItem): item is GuideEditorialProseItem {
  return item.kind === "prose";
}

function isGuidePreviewItem(
  item: GuideEditorialItem
): item is GuideGuidePreviewItem {
  return item.kind === "guidePreview";
}

export default function GuideEditorialGroups({
  groups,
  profileId,
  profileSlug,
  savedFilmIds,
  filmRatings,
  ratingsReady,
  hideFestivalBadges = false,
  onSavedChange,
  onRatingChange,
  onAuthRequired,
  currentGuidePath,
}: GuideEditorialGroupsProps) {
  // Taste unlock is account-wide: do not scope to films on this page only,
  // or logged-in users with an existing profile still see "start shaping…".
  const { getHintForIndex, onDismissRatingOnboarding } = useRatingOnboarding(
    filmRatings,
    {
      enabled: true,
      ratingsReady,
      mediaType: MEDIA_TYPE.animation,
    }
  );

  let cardIndex = 0;

  return (
    <div data-testid="film-list" className="grid gap-16">
      {groups.map((group, groupIndex) => {
        const heading = group.heading?.trim() ?? "";
        const description = group.description?.trim() ?? "";
        const showGroupHeader = Boolean(heading);

        return (
          <section
            key={heading || `group-${groupIndex}`}
            className={showGroupHeader ? "grid gap-6" : "grid"}
          >
            {showGroupHeader ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold tracking-[0.22em] text-[#B1A9D9]">
                  {String(groupIndex + 1).padStart(2, "0")}
                </p>
                <h2 className="font-sans text-[22px] font-medium leading-[1.25] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[24px]">
                  {heading}
                </h2>
                {description ? (
                  <div className={`mt-3 space-y-3 ${GUIDE_PROSE_CLASS}`}>
                    {description.split(/\n\n+/).map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 24)}
                        className="text-[16px] leading-[1.65] text-[#4a4b5c]"
                      >
                        <GuideProseText text={paragraph} />
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {group.items.length > 0 ? (
              <div className="grid gap-8">
                {group.items.map((item, itemIndex) => {
                  if (isProseItem(item)) {
                    return (
                      <div
                        key={`prose-${itemIndex}-${item.text.slice(0, 24)}`}
                        data-testid="guide-prose-block"
                        className={`space-y-3 ${GUIDE_PROSE_CLASS}`}
                      >
                        {item.text.split(/\n\n+/).map((paragraph) => (
                          <p
                            key={paragraph.slice(0, 24)}
                            className="text-[16px] leading-[1.65] text-[#4a4b5c]"
                          >
                            <GuideProseText text={paragraph} />
                          </p>
                        ))}
                      </div>
                    );
                  }

                  if (isShortItem(item)) {
                    return (
                      <GuideShortFilmRow
                        key={`${item.title}-${item.year}`}
                        item={item}
                      />
                    );
                  }

                  if (isGuidePreviewItem(item)) {
                    return (
                      <GuideGuidePreview
                        key={`guide-preview-${item.href}`}
                        item={item}
                      />
                    );
                  }

                  const index = cardIndex;
                  cardIndex += 1;
                  const card = (
                    <GuideFilmEngageTracker
                      filmId={item.film.id}
                      filmTitle={item.film.title}
                      guidePath={currentGuidePath ?? ""}
                    >
                      <FilmCard
                        mode="catalog"
                        film={item.film}
                        lazyLoadPoster={index >= 1}
                        profileId={profileId}
                        profileSlug={profileSlug}
                        initialRating={filmRatings[item.film.id] ?? null}
                        savedFilmIds={savedFilmIds}
                        onSavedChange={onSavedChange}
                        onRatingChange={onRatingChange}
                        onAuthRequired={onAuthRequired}
                        currentGuidePath={currentGuidePath}
                        hideFestivalBadges={hideFestivalBadges}
                        ratingOnboardingHint={getHintForIndex(index)}
                        onDismissRatingOnboarding={onDismissRatingOnboarding}
                      />
                    </GuideFilmEngageTracker>
                  );

                  if (!item.note && !item.awards) {
                    return (
                      <div
                        key={item.film.id}
                        id={`guide-film-${item.film.id}`}
                        className="scroll-mt-24"
                      >
                        {card}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.film.id}
                      id={`guide-film-${item.film.id}`}
                      className="grid scroll-mt-24 gap-2.5"
                    >
                      <div className="grid gap-1.5">
                        <h3
                          data-testid="guide-film-heading"
                          className="font-sans text-[16px] font-medium leading-snug tracking-tight text-[#B1A9D9] antialiased [font-synthesis:none]"
                        >
                          {item.film.title}
                        </h3>
                        {item.note ? (
                          <p
                            data-testid="guide-film-note"
                            className={`whitespace-pre-line text-[16px] leading-[1.65] text-[#4a4b5c] ${GUIDE_PROSE_CLASS}`}
                          >
                            <GuideProseText text={item.note} />
                          </p>
                        ) : null}
                        {item.awards ? (
                          <p
                            data-testid="guide-film-awards"
                            className={`flex items-start gap-1.5 text-[14px] leading-[1.5] text-[#8a5b2d] ${GUIDE_PROSE_CLASS}`}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className="mt-[0.2em] h-[1em] w-[1em] shrink-0 fill-current"
                            >
                              <path d="M7 3h10v2h2.5a1.5 1.5 0 0 1 1.5 1.5V8a5.5 5.5 0 0 1-4.3 5.36A4.5 4.5 0 0 1 13 16.9V18h3v2H8v-2h3v-1.1a4.5 4.5 0 0 1-3.7-3.54A5.5 5.5 0 0 1 3 8V6.5A1.5 1.5 0 0 1 4.5 5H7V3Zm0 4H5v1a3.5 3.5 0 0 0 2.3 3.28A4.49 4.49 0 0 1 7 10V7Zm10 0v3c0 .78-.16 1.52-.46 2.18A3.5 3.5 0 0 0 19 8V7h-2ZM9 5v5a2.5 2.5 0 0 0 5 0V5H9Z" />
                            </svg>
                            <span>{item.awards}</span>
                          </p>
                        ) : null}
                      </div>
                      {card}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
