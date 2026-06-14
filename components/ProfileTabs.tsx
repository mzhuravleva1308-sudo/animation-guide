"use client";

import { useMemo, useState } from "react";
import {
  FilmScore,
} from "@/lib/profile-film-scoring";
import { Film } from "@/types/film";
import RatingButtons from "@/components/RatingButtons";
import WatchlistButton from "@/components/WatchlistButton";
import UpdateTasteProfileButton from "@/components/UpdateTasteProfileButton";

export type ProfileTab = "top picks" | "saved" | "all" | "rated";

type ProfileTasteCore = {
  id: string;
  core_index: number;
  core_type: string | null;
  name: string | null;
  strength: number;
  coverage: number | null;
  maturity: string | null;
  nearest_moods: string[] | null;
  emotional_profile_tags?: string[] | null;
  aesthetic_profile_tags?: string[] | null;
};

type ProfileTabsProps = {
  profileSlug: string;
  token: string;
  profileName: string;
  tasteProfile: string | null;
  tasteProfileUpdatedAt: string | null;
  tasteCores: ProfileTasteCore[];
  topPicksFilms: Film[];
  topPicksScores: Record<string, FilmScore>;
  allFilmsSorted: Film[];
  allFilmsScores: Record<string, FilmScore>;
  savedFilms: Film[];
  watchedFilms: Film[];
  allFilmsPageSize: number;
  loadError?: string | null;
};

const TAB_LABELS: Array<{ id: ProfileTab; label: string }> = [
  { id: "top picks", label: "Top picks" },
  { id: "saved", label: "Saved" },
  { id: "all", label: "All films" },
  { id: "rated", label: "Watched" },
];

function getCoreProfileTags(core: ProfileTasteCore) {
  if (core.core_type === "emotional") {
    return core.emotional_profile_tags ?? core.nearest_moods ?? [];
  }

  if (core.core_type === "aesthetic") {
    return core.aesthetic_profile_tags ?? core.nearest_moods ?? [];
  }

  return core.nearest_moods ?? [];
}

function tabButtonClass(isActive: boolean) {
  return `rounded-full border px-4 py-2 text-sm font-medium ${
    isActive
      ? "border-black bg-black text-white"
      : "border-gray-300 bg-white text-gray-700"
  }`;
}

export default function ProfileTabs({
  profileSlug,
  token,
  profileName,
  tasteProfile,
  tasteProfileUpdatedAt,
  tasteCores,
  topPicksFilms,
  topPicksScores,
  allFilmsSorted,
  allFilmsScores,
  savedFilms,
  watchedFilms,
  allFilmsPageSize,
  loadError,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("top picks");
  const [allFilmsPage, setAllFilmsPage] = useState(1);

  const totalAllFilmsCount = allFilmsSorted.length;
  const allFilmsTotalPages = Math.max(
    1,
    Math.ceil(totalAllFilmsCount / allFilmsPageSize)
  );
  const allFilmsCurrentPage = Math.min(allFilmsPage, allFilmsTotalPages);

  const { films, scores } = useMemo(() => {
    if (activeTab === "top picks") {
      return { films: topPicksFilms, scores: topPicksScores };
    }

    if (activeTab === "saved") {
      return { films: savedFilms, scores: {} as Record<string, FilmScore> };
    }

    if (activeTab === "rated") {
      return { films: watchedFilms, scores: {} as Record<string, FilmScore> };
    }

    const start = (allFilmsCurrentPage - 1) * allFilmsPageSize;
    const end = start + allFilmsPageSize;

    return {
      films: allFilmsSorted.slice(start, end),
      scores: allFilmsScores,
    };
  }, [
    activeTab,
    allFilmsCurrentPage,
    allFilmsPageSize,
    allFilmsSorted,
    allFilmsScores,
    savedFilms,
    topPicksFilms,
    topPicksScores,
    watchedFilms,
  ]);

  function handleTabChange(tab: ProfileTab) {
    setActiveTab(tab);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        {TAB_LABELS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={tabButtonClass(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "all" && totalAllFilmsCount > 0 && (
        <p className="mb-6 text-sm text-gray-500">
          {totalAllFilmsCount} films in the guide
        </p>
      )}

      {activeTab === "rated" && (
        <p className="mb-6 text-sm text-gray-500">
          Showing {watchedFilms.length} watched{" "}
          {watchedFilms.length === 1 ? "film" : "films"}
        </p>
      )}

      {activeTab === "rated" && watchedFilms.length > 0 && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="mb-1 text-sm font-medium text-gray-500">
            What the system knows about you
          </p>

          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            {profileName}’s taste profile
          </h2>

          <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-gray-700">
            {tasteProfile ??
              "No AI taste profile yet. Generate one from your rated films."}
          </p>

          {tasteProfileUpdatedAt && (
            <p className="mt-3 text-xs text-gray-400">
              Last updated:{" "}
              {new Date(tasteProfileUpdatedAt).toLocaleDateString()}
            </p>
          )}

          <UpdateTasteProfileButton profileSlug={profileSlug} token={token} />
        </section>
      )}

      {activeTab === "all" && tasteCores.length > 0 && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-4 text-sm font-medium text-gray-700">
            Taste cores detected from your ratings
          </p>

          <div className="space-y-4">
            {[...tasteCores]
              .sort((a, b) => {
                const order = { emotional: 0, aesthetic: 1 };

                return (
                  (order[a.core_type as "emotional" | "aesthetic"] ?? 99) -
                  (order[b.core_type as "emotional" | "aesthetic"] ?? 99)
                );
              })
              .map((core) => {
                const coreProfileTags = getCoreProfileTags(core);

                return (
                  <div key={`${core.core_type}-${core.core_index}`}>
                    {coreProfileTags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {coreProfileTags.slice(0, 10).map((tag) => (
                          <span
                            key={tag}
                            className={`rounded-full border px-3 py-1 text-sm ${
                              core.core_type === "aesthetic"
                                ? "border-stone-200 bg-stone-100 text-stone-700"
                                : "border-gray-200 bg-gray-50 text-gray-600"
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {loadError}
        </div>
      )}

      {!films.length && !loadError && (
        <div className="rounded-2xl border border-dashed p-8 text-gray-500">
          {activeTab === "top picks"
            ? "No top picks left. Try All films or clear some ratings."
            : activeTab === "saved"
              ? "No saved films yet."
              : activeTab === "rated"
                ? "No watched films yet."
                : "No films yet. Add your first one."}
        </div>
      )}

      <section className="grid gap-4">
        {films.map((film) => {
          const score = scores[film.id] ?? null;

          return (
            <article
              key={film.id}
              className="grid gap-5 rounded-2xl border p-5 md:grid-cols-[160px_1fr]"
            >
              <div className="relative h-56 w-full overflow-hidden rounded-xl bg-gray-100 md:h-60">
                {film.image_url ? (
                  <img
                    src={film.image_url}
                    alt={film.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    No image
                  </div>
                )}

                {film.trailer_url && (
                  <a
                    href={film.trailer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-black shadow-sm backdrop-blur hover:bg-white"
                  >
                    ▶ Trailer
                  </a>
                )}
              </div>

              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-medium">{film.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {[
                        film.director,
                        film.year,
                        film.country,
                        film.duration_minutes
                          ? `${film.duration_minutes} min`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {score && (
                      <div className="mt-2 space-y-0.5 text-xs text-gray-400">
                        <p>Raw emotional: {score.emotional.toFixed(4)}</p>
                        <p>Raw material: {score.material.toFixed(4)}</p>
                        <p>Balanced total: {score.balanced.toFixed(4)}</p>
                      </div>
                    )}
                  </div>

                  {film.availability && film.availability !== "unknown" && (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                      {film.availability}
                    </span>
                  )}
                </div>

                {film.synopsis && (
                  <p className="mt-4 text-gray-700">{film.synopsis}</p>
                )}

                <div className="mt-4 space-y-3">
                  {film.moods?.length ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {film.moods.map((mood) => (
                          <span
                            key={mood}
                            className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                          >
                            {mood}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {film.aesthetic_tags?.length ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {film.aesthetic_tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-stone-100 px-3 py-1 text-sm text-gray-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {film.narrative_tags?.length ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {film.narrative_tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {film.technique && (
                    <div>
                      <span className="inline-flex rounded-full bg-gray-50 px-3 py-1 text-sm text-gray-500">
                        {film.technique}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-end justify-between gap-6 pt-4">
                  <RatingButtons filmId={film.id} profileSlug={profileSlug} />
                  <WatchlistButton filmId={film.id} profileSlug={profileSlug} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {activeTab === "all" && totalAllFilmsCount > 0 && (
        <nav
          aria-label="All films pagination"
          className="mt-8 flex items-center justify-center gap-4"
        >
          {allFilmsCurrentPage > 1 ? (
            <button
              type="button"
              onClick={() => setAllFilmsPage(allFilmsCurrentPage - 1)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
          ) : (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400">
              Previous
            </span>
          )}

          <span className="text-sm text-gray-600">
            Page {allFilmsCurrentPage} of {allFilmsTotalPages}
          </span>

          {allFilmsCurrentPage < allFilmsTotalPages ? (
            <button
              type="button"
              onClick={() => setAllFilmsPage(allFilmsCurrentPage + 1)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </button>
          ) : (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400">
              Next
            </span>
          )}
        </nav>
      )}
    </>
  );
}
