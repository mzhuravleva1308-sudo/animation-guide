"use client";

import FilmCard from "@/components/FilmCard";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";
import { useRatingOnboarding } from "@/lib/use-rating-onboarding";
import { MEDIA_TYPE } from "@/lib/media-type";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";
import { Film } from "@/types/film";

export type GuideEditorialItem = {
  film: Film;
  note?: string | null;
};

export type GuideEditorialGroup = {
  heading: string;
  description: string;
  items: GuideEditorialItem[];
};

type GuideEditorialGroupsProps = {
  groups: GuideEditorialGroup[];
  profileId?: string;
  profileSlug?: string;
  savedFilmIds: Set<string>;
  filmRatings: Record<string, number | null>;
  ratingsReady: boolean;
  onSavedChange: (film: Film, saved: boolean) => void;
  onRatingChange: (
    filmId: string,
    rating: number | null,
    options?: { skipOrderUpdate?: boolean }
  ) => void;
  onAuthRequired?: (action: PendingFilmActionInput) => void;
  currentGuidePath?: string;
};

export default function GuideEditorialGroups({
  groups,
  profileId,
  profileSlug,
  savedFilmIds,
  filmRatings,
  ratingsReady,
  onSavedChange,
  onRatingChange,
  onAuthRequired,
  currentGuidePath,
}: GuideEditorialGroupsProps) {
  const films = groups.flatMap((group) => group.items.map((item) => item.film));
  const { getHintForIndex, onDismissRatingOnboarding } = useRatingOnboarding(
    filmRatings,
    {
      enabled: true,
      ratingsReady,
      mediaType: MEDIA_TYPE.animation,
      scopeFilmIds: films.map((film) => film.id),
    }
  );

  let cardIndex = 0;

  return (
    <div data-testid="film-list" className="grid gap-16">
      {groups.map((group, groupIndex) => (
        <section key={group.heading} className="grid gap-6">
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.22em] text-[#B1A9D9]">
              {String(groupIndex + 1).padStart(2, "0")}
            </p>
            <h2 className="font-sans text-[22px] font-medium leading-[1.25] tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none] sm:text-[24px]">
              {group.heading}
            </h2>
            <p className={`mt-3 text-[15px] leading-7 text-[#4a4b5c] ${GUIDE_PROSE_CLASS}`}>
              {group.description}
            </p>
          </div>
          {group.items.map((item) => {
            const index = cardIndex;
            cardIndex += 1;
            const card = (
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
                ratingOnboardingHint={getHintForIndex(index)}
                onDismissRatingOnboarding={onDismissRatingOnboarding}
              />
            );

            if (!item.note) {
              return <div key={item.film.id}>{card}</div>;
            }

            return (
              <div key={item.film.id} className="grid gap-3">
                <p
                  data-testid="guide-film-note"
                  className={`text-[15px] leading-7 text-[#4a4b5c] ${GUIDE_PROSE_CLASS}`}
                >
                  {item.note}
                </p>
                {card}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
