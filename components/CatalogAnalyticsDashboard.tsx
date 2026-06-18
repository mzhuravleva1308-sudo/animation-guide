import type { ReactNode } from "react";

type CountEntry = {
  label: string;
  count: number;
};

type TagEntry = {
  tag: string;
  count: number;
};

type FilmRef = {
  id: string;
  title: string;
  original_title?: string | null;
  year?: number | null;
  director?: string | null;
};

type CoverageSection = {
  top?: CountEntry[];
  lowCoverage?: CountEntry[];
  uniqueValues?: number;
};

type TagSection = {
  top?: TagEntry[];
  rare?: TagEntry[];
  veryFrequent?: TagEntry[];
};

type DuplicateGroup = {
  key: string;
  count: number;
  films: FilmRef[];
};

type FuzzyPair = {
  similarity: number;
  films: FilmRef[];
};

type Suggestion = {
  priority: "high" | "medium" | "low";
  category: string;
  suggestion: string;
  rationale: string;
};

export type CatalogAnalytics = {
  generatedAt: string;
  overview: {
    totalFilms: number;
    withPoster: number;
    withoutPoster: number;
    withDuration: number;
    withoutDuration: number;
    withTechnique: number;
    withoutTechnique: number;
    withFestival: number;
    withoutFestival: number;
    averageMoodsPerFilm: number;
    averageAestheticTagsPerFilm: number;
    averageNarrativeTagsPerFilm: number;
    from2020Onward: number;
  };
  metadataHealth: {
    missingPoster: FilmRef[];
    missingDuration: FilmRef[];
    missingTechnique: FilmRef[];
    missingFestival: FilmRef[];
    suspiciousValues: Array<FilmRef & { fields: string[] }>;
    tooFewTags: Array<FilmRef & { totalTags: number }>;
    unusuallyManyTags: Array<FilmRef & { totalTags: number }>;
  };
  countryCoverage: CoverageSection;
  curationRegionCoverage: CoverageSection;
  decadeCoverage: CoverageSection & {
    oldestFilms: FilmRef[];
    newestFilms: FilmRef[];
    from2020Onward: number;
  };
  techniqueCoverage: CoverageSection;
  festivalCoverage: CoverageSection & {
    available: boolean;
    withFestival: number;
    withoutFestival: number;
    animationFestivalFilms: number;
    generalFestivalFilms: number;
    otherFestivalFilms: number;
  };
  sourceCoverage: CoverageSection & {
    available: boolean;
    withSource: number;
    withoutSource: number;
  };
  moodCoverage: TagSection;
  aestheticTagCoverage: TagSection;
  narrativeTagCoverage: TagSection;
  potentialDuplicates: {
    normalizedTitleDuplicates: DuplicateGroup[];
    normalizedOriginalTitleDuplicates: DuplicateGroup[];
    titleYearDuplicates: DuplicateGroup[];
    originalTitleYearDuplicates: DuplicateGroup[];
    fuzzyTitlePairs: FuzzyPair[];
    totalSignals: number;
  };
  curationSuggestions: {
    note: string;
    items: Suggestion[];
  };
};

function formatFilmLabel(film: FilmRef) {
  const parts = [film.title];
  if (film.year) parts.push(String(film.year));
  if (film.director) parts.push(film.director);
  return parts.join(" · ");
}

function OverviewCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

function HorizontalBars({
  items,
  maxItems = 10,
}: {
  items: CountEntry[];
  maxItems?: number;
}) {
  const visibleItems = items.slice(0, maxItems);
  const maxCount = visibleItems[0]?.count ?? 1;

  if (visibleItems.length === 0) {
    return <p className="text-sm text-gray-500">No data available.</p>;
  }

  return (
    <div className="space-y-2">
      {visibleItems.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>{item.label}</span>
            <span className="text-gray-500">{item.count}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-gray-800"
              style={{ width: `${Math.max(4, (item.count / maxCount) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TagChips({ items, emptyLabel }: { items: TagEntry[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.tag}
          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
        >
          {item.tag} ({item.count})
        </span>
      ))}
    </div>
  );
}

function FilmList({ films }: { films: FilmRef[] }) {
  if (films.length === 0) {
    return <p className="text-sm text-gray-500">None</p>;
  }

  return (
    <ul className="space-y-1 text-sm text-gray-700">
      {films.map((film) => (
        <li key={film.id}>{formatFilmLabel(film)}</li>
      ))}
    </ul>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DuplicateGroups({ groups, title }: { groups: DuplicateGroup[]; title: string }) {
  if (groups.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm text-gray-700">
        {groups.slice(0, 8).map((group) => (
          <li key={group.key} className="rounded-md bg-gray-50 p-3">
            {group.films.map((film) => formatFilmLabel(film)).join(" / ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CatalogAnalyticsDashboard({
  analytics,
}: {
  analytics: CatalogAnalytics;
}) {
  const { overview, metadataHealth, potentialDuplicates } = analytics;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          Generated {new Date(analytics.generatedAt).toLocaleString()}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Read-only catalog analytics for curation planning. This page does not
          modify the database.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <OverviewCard label="Total films" value={overview.totalFilms} />
        <OverviewCard label="Missing posters" value={overview.withoutPoster} />
        <OverviewCard label="Missing duration" value={overview.withoutDuration} />
        <OverviewCard label="Missing technique" value={overview.withoutTechnique} />
        <OverviewCard
          label="Missing festival"
          value={overview.withoutFestival}
          hint={analytics.festivalCoverage.available ? undefined : "Field unavailable"}
        />
        <OverviewCard
          label="Missing source"
          value={analytics.sourceCoverage.withoutSource}
          hint={analytics.sourceCoverage.available ? "source_url" : "Field unavailable"}
        />
        <OverviewCard
          label="Duplicate signals"
          value={potentialDuplicates.totalSignals}
        />
        <OverviewCard
          label="Avg moods / film"
          value={overview.averageMoodsPerFilm}
        />
        <OverviewCard
          label="Films from 2020+"
          value={overview.from2020Onward}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Country coverage">
          <HorizontalBars items={analytics.countryCoverage.top ?? []} />
        </Section>
        <Section title="Curation region coverage">
          <p className="mb-4 text-sm text-gray-600">
            Macro programming basins from country metadata — each film counts once
            using its first listed country. Use country coverage for co-production
            detail.
          </p>
          <HorizontalBars
            items={analytics.curationRegionCoverage.top ?? []}
            maxItems={analytics.curationRegionCoverage.top?.length ?? 10}
          />
        </Section>
        <Section title="Decade coverage">
          <HorizontalBars items={analytics.decadeCoverage.top ?? []} />
        </Section>
        <Section title="Technique coverage">
          <HorizontalBars items={analytics.techniqueCoverage.top ?? []} />
        </Section>
        <Section title="Festival coverage">
          {analytics.festivalCoverage.available ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-gray-500">With festival</p>
                  <p className="font-medium">{analytics.festivalCoverage.withFestival}</p>
                </div>
                <div>
                  <p className="text-gray-500">Animation festivals</p>
                  <p className="font-medium">
                    {analytics.festivalCoverage.animationFestivalFilms}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">General festivals</p>
                  <p className="font-medium">
                    {analytics.festivalCoverage.generalFestivalFilms}
                  </p>
                </div>
              </div>
              <HorizontalBars items={analytics.festivalCoverage.top ?? []} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">Festival coverage is not available.</p>
          )}
        </Section>
        <Section title="Source coverage">
          {analytics.sourceCoverage.available ? (
            <HorizontalBars items={analytics.sourceCoverage.top ?? []} />
          ) : (
            <p className="text-sm text-gray-500">Source coverage is not available.</p>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Mood coverage">
          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Top</p>
          <TagChips items={analytics.moodCoverage.top ?? []} emptyLabel="No moods tagged" />
          <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-gray-500">Rare</p>
          <TagChips
            items={(analytics.moodCoverage.rare ?? []).slice(0, 12)}
            emptyLabel="No rare moods"
          />
        </Section>
        <Section title="Aesthetic tags">
          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Top</p>
          <TagChips
            items={analytics.aestheticTagCoverage.top ?? []}
            emptyLabel="No aesthetic tags"
          />
          <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-gray-500">Rare</p>
          <TagChips
            items={(analytics.aestheticTagCoverage.rare ?? []).slice(0, 12)}
            emptyLabel="No rare aesthetic tags"
          />
        </Section>
        <Section title="Narrative tags">
          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Top</p>
          <TagChips
            items={analytics.narrativeTagCoverage.top ?? []}
            emptyLabel="No narrative tags"
          />
          <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-gray-500">Rare</p>
          <TagChips
            items={(analytics.narrativeTagCoverage.rare ?? []).slice(0, 12)}
            emptyLabel="No rare narrative tags"
          />
        </Section>
      </div>

      <Section title="Metadata health">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-gray-700">Missing poster</h3>
            <div className="mt-2 max-h-48 overflow-y-auto">
              <FilmList films={metadataHealth.missingPoster.slice(0, 20)} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700">Missing duration</h3>
            <div className="mt-2 max-h-48 overflow-y-auto">
              <FilmList films={metadataHealth.missingDuration.slice(0, 20)} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700">Too few tags</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {metadataHealth.tooFewTags.slice(0, 20).map((film) => (
                <li key={film.id}>
                  {formatFilmLabel(film)} ({film.totalTags} tags)
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700">Suspicious placeholders</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {metadataHealth.suspiciousValues.slice(0, 20).map((film) => (
                <li key={film.id}>
                  {formatFilmLabel(film)} — {film.fields.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Potential duplicates">
        <div className="space-y-4">
          <DuplicateGroups
            title="Normalized title duplicates"
            groups={potentialDuplicates.normalizedTitleDuplicates}
          />
          <DuplicateGroups
            title="Same title + year"
            groups={potentialDuplicates.titleYearDuplicates}
          />
          {potentialDuplicates.fuzzyTitlePairs.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-gray-700">Fuzzy similar titles</h3>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                {potentialDuplicates.fuzzyTitlePairs.slice(0, 10).map((pair, index) => (
                  <li key={`${pair.films[0]?.id}-${pair.films[1]?.id}-${index}`} className="rounded-md bg-gray-50 p-3">
                    {pair.films.map((film) => formatFilmLabel(film)).join(" / ")} (
                    {pair.similarity}% similar)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Suggested curation gaps">
        <p className="text-sm text-gray-600">{analytics.curationSuggestions.note}</p>
        <ul className="mt-4 space-y-3">
          {analytics.curationSuggestions.items.map((item, index) => (
            <li key={`${item.category}-${index}`} className="rounded-md bg-gray-50 p-3 text-sm">
              <p className="font-medium">
                [{item.priority}] {item.category}: {item.suggestion}
              </p>
              <p className="mt-1 text-gray-600">{item.rationale}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
