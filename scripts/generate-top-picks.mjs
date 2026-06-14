import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

const LIKED_RATING_THRESHOLD = 7;
const WEAK_PROFILE_LIKED_COUNT = 3;
const TARGET_RECOMMENDATION_COUNT = 10;
const MIN_RECOMMENDATION_COUNT = 7;
const MAX_REPAIR_ATTEMPTS = 2;

const VALID_CATEGORIES = ["safe_choice", "taste_hit", "risky_discovery"];

const IDEAL_CATEGORY_COUNTS = {
  safe_choice: 3,
  taste_hit: 4,
  risky_discovery: 3,
};

const FILM_SUMMARY_FIELDS = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "festival",
  "technique",
  "moods",
  "synopsis",
];

function truncateText(value, maxLength = 240) {
  const text = String(value ?? "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function toFilmSummary(film) {
  return {
    id: film.id,
    title: film.title,
    original_title: film.original_title ?? null,
    director: film.director ?? null,
    year: film.year ?? null,
    country: film.country ?? null,
    duration_minutes: film.duration_minutes ?? null,
    festival: film.festival ?? null,
    technique: film.technique ?? null,
    moods: film.moods ?? [],
    synopsis: truncateText(film.synopsis),
  };
}

function toLikedFilmSummary(film, rating) {
  return {
    ...toFilmSummary(film),
    rating,
  };
}

function countByCategory(recommendations) {
  return recommendations.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCategorySummary(recommendations) {
  const counts = countByCategory(recommendations);

  return VALID_CATEGORIES.map(
    (category) => `${counts[category] ?? 0} ${category.replace("_", " ")}`
  ).join(", ");
}

async function getProfiles(profileSlug) {
  let query = supabase.from("profiles").select("id, slug, name").order("slug");

  if (profileSlug) {
    query = query.eq("slug", profileSlug);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getAllFilms() {
  const { data, error } = await supabase
    .from("films")
    .select(FILM_SUMMARY_FIELDS.join(", "))
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getLikedFilms(profileId) {
  const { data: ratings, error: ratingsError } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profileId)
    .gte("rating", LIKED_RATING_THRESHOLD);

  if (ratingsError) {
    throw ratingsError;
  }

  const filmIds = (ratings ?? []).map((item) => item.film_id);

  if (!filmIds.length) {
    return [];
  }

  const ratingByFilmId = new Map(
    (ratings ?? []).map((item) => [item.film_id, item.rating])
  );

  const { data: films, error: filmsError } = await supabase
    .from("films")
    .select(FILM_SUMMARY_FIELDS.join(", "))
    .in("id", filmIds);

  if (filmsError) {
    throw filmsError;
  }

  return (films ?? [])
    .map((film) => ({
      film,
      rating: ratingByFilmId.get(film.id) ?? null,
    }))
    .sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
}

async function getRatedFilmIds(profileId) {
  const { data, error } = await supabase
    .from("film_ratings")
    .select("film_id")
    .eq("profile_id", profileId);

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((item) => item.film_id));
}

function buildPrompt({ profileName, likedFilms, candidateFilms, repairNote }) {
  const likedSummaries = likedFilms.map(({ film, rating }) =>
    toLikedFilmSummary(film, rating)
  );
  const candidateSummaries = candidateFilms.map(toFilmSummary);
  const weakProfile = likedSummaries.length < WEAK_PROFILE_LIKED_COUNT;

  const repairSection = repairNote
    ? `\nRepair note from the previous attempt:\n${repairNote}\n`
    : "";

  return `
You are selecting personalized animated film recommendations for ${profileName}.

The user has liked these films (rating >= ${LIKED_RATING_THRESHOLD}/10):
${JSON.stringify(likedSummaries, null, 2)}

Candidate films from our database (you may ONLY recommend from this list):
${JSON.stringify(candidateSummaries, null, 2)}

Rules:
- Select exactly 10 films from the candidate list when possible.
- Do NOT recommend any film the user has already liked or rated.
- Every film_id must exactly match an id from the candidate list.
- Do not invent films or ids.
- Aim for this distribution:
  - 3 safe_choice
  - 4 taste_hit
  - 3 risky_discovery
- rank is 1-based within each category.

Category intent:
- safe_choice: very likely matches existing taste; close to what they already enjoy.
- taste_hit: strong, sharper matches to specific taste points; distinctive but grounded in likes.
- risky_discovery: less obvious picks with a meaningful bridge to their likes; could open a new direction.

For each pick, write reason as 1-2 sentences that feel personal and specific to this user.
Avoid generic lines like "You may like this because it is animated and emotional."

${weakProfile ? `Important: the taste profile is weak because the user has fewer than ${WEAK_PROFILE_LIKED_COUNT} liked films. Lean more on general high-quality diverse recommendations from the candidate list, while still grouping them into the three categories.` : "Use the liked films as the main taste profile."}
${repairSection}
Return strict JSON only:
{
  "recommendations": [
    {
      "film_id": "uuid",
      "category": "safe_choice",
      "rank": 1,
      "reason": "..."
    }
  ]
}
`.trim();
}

function parseAiResponse(content) {
  if (!content) {
    throw new Error("Empty AI response");
  }

  try {
    const parsed = JSON.parse(content);
    const recommendations = parsed.recommendations ?? parsed;

    if (!Array.isArray(recommendations)) {
      throw new Error("AI response recommendations must be an array");
    }

    return recommendations;
  } catch (error) {
    throw new Error(`Malformed AI JSON: ${error.message}`);
  }
}

function validateRecommendations(recommendations, candidateFilmIds, ratedFilmIds) {
  if (!Array.isArray(recommendations)) {
    throw new Error("AI response recommendations must be an array");
  }

  const seenFilmIds = new Set();
  const validated = [];

  for (const item of recommendations) {
    const category = item?.category;
    const filmId = item?.film_id;
    const reason = String(item?.reason ?? "").trim();

    if (!filmId || typeof filmId !== "string") {
      throw new Error(`Invalid film_id: ${filmId}`);
    }

    if (!VALID_CATEGORIES.includes(category)) {
      throw new Error(`Invalid category: ${category}`);
    }

    if (!reason) {
      throw new Error(`Missing reason for film ${filmId}`);
    }

    if (!candidateFilmIds.has(filmId)) {
      throw new Error(`Recommended film_id not in candidate list: ${filmId}`);
    }

    if (ratedFilmIds.has(filmId)) {
      throw new Error(`Recommended already liked/rated film: ${filmId}`);
    }

    if (seenFilmIds.has(filmId)) {
      throw new Error(`Duplicate film_id in recommendations: ${filmId}`);
    }

    seenFilmIds.add(filmId);
    validated.push({
      film_id: filmId,
      category,
      rank: Number(item?.rank),
      reason,
    });
  }

  if (validated.length > TARGET_RECOMMENDATION_COUNT) {
    throw new Error(
      `Expected at most ${TARGET_RECOMMENDATION_COUNT} recommendations, got ${validated.length}`
    );
  }

  return validated;
}

function normalizeRanks(recommendations) {
  const grouped = Object.fromEntries(
    VALID_CATEGORIES.map((category) => [category, []])
  );

  for (const item of recommendations) {
    grouped[item.category].push(item);
  }

  const normalized = [];

  for (const category of VALID_CATEGORIES) {
    const items = grouped[category]
      .slice()
      .sort((a, b) => {
        const rankA =
          Number.isInteger(a.rank) && a.rank >= 1 ? a.rank : Number.MAX_SAFE_INTEGER;
        const rankB =
          Number.isInteger(b.rank) && b.rank >= 1 ? b.rank : Number.MAX_SAFE_INTEGER;

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return a.film_id.localeCompare(b.film_id);
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    normalized.push(...items);
  }

  return normalized;
}

function collectDistributionWarnings(recommendations) {
  const warnings = [];
  const counts = countByCategory(recommendations);

  if (recommendations.length !== TARGET_RECOMMENDATION_COUNT) {
    warnings.push(
      `Warning: expected ${TARGET_RECOMMENDATION_COUNT} recommendations, got ${recommendations.length}. Saving valid partial result.`
    );
  }

  for (const category of VALID_CATEGORIES) {
    const actual = counts[category] ?? 0;
    const expected = IDEAL_CATEGORY_COUNTS[category];

    if (actual !== expected) {
      warnings.push(
        `Warning: expected ${expected} ${category} picks, got ${actual}.`
      );
    }
  }

  return warnings;
}

async function callAiForRecommendations({
  profileName,
  likedFilms,
  candidateFilms,
  repairNote,
}) {
  const prompt = buildPrompt({
    profileName,
    likedFilms,
    candidateFilms,
    repairNote,
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a thoughtful film curator for a personal animation guide. You return strict JSON only and never recommend films outside the provided candidate list.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  return parseAiResponse(response.choices[0]?.message?.content);
}

async function generateRecommendations({
  profileName,
  likedFilms,
  candidateFilms,
  ratedFilmIds,
}) {
  const candidateFilmIds = new Set(candidateFilms.map((film) => film.id));
  let repairNote = null;
  let lastCountError = null;

  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    const rawRecommendations = await callAiForRecommendations({
      profileName,
      likedFilms,
      candidateFilms,
      repairNote,
    });

    const validated = validateRecommendations(
      rawRecommendations,
      candidateFilmIds,
      ratedFilmIds
    );
    const recommendations = normalizeRanks(validated);

    if (recommendations.length >= MIN_RECOMMENDATION_COUNT) {
      return {
        recommendations,
        warnings: collectDistributionWarnings(recommendations),
      };
    }

    lastCountError = new Error(
      `Only ${recommendations.length} valid recommendations returned (need at least ${MIN_RECOMMENDATION_COUNT})`
    );

    repairNote = [
      `Previous attempt returned only ${recommendations.length} valid recommendations.`,
      `Return at least ${MIN_RECOMMENDATION_COUNT} and ideally ${TARGET_RECOMMENDATION_COUNT}.`,
      "Use only candidate film_id values.",
      "Do not repeat film_id values.",
      "Every item needs a valid category and a non-empty reason.",
    ].join(" ");
  }

  throw lastCountError;
}

async function saveTopPicks(profileId, recommendations) {
  const { error: deleteError } = await supabase
    .from("top_picks")
    .delete()
    .eq("profile_id", profileId);

  if (deleteError) {
    throw deleteError;
  }

  const rows = recommendations.map((item) => ({
    profile_id: profileId,
    film_id: item.film_id,
    category: item.category,
    rank: item.rank,
    reason: item.reason,
  }));

  const { error: insertError } = await supabase.from("top_picks").insert(rows);

  if (insertError) {
    throw insertError;
  }
}

async function generateForProfile(profile, allFilms) {
  console.log(`\nProfile: ${profile.name} (${profile.slug})`);

  const likedFilms = await getLikedFilms(profile.id);
  const ratedFilmIds = await getRatedFilmIds(profile.id);
  const likedFilmIds = new Set(likedFilms.map(({ film }) => film.id));

  const candidateFilms = allFilms.filter(
    (film) => !ratedFilmIds.has(film.id) && !likedFilmIds.has(film.id)
  );

  console.log(`  Liked films: ${likedFilms.length}`);
  console.log(`  Candidate films: ${candidateFilms.length}`);

  if (candidateFilms.length < MIN_RECOMMENDATION_COUNT) {
    throw new Error(
      `Not enough candidate films (${candidateFilms.length}). Need at least ${MIN_RECOMMENDATION_COUNT} unrated films.`
    );
  }

  const { recommendations, warnings } = await generateRecommendations({
    profileName: profile.name,
    likedFilms,
    candidateFilms,
    ratedFilmIds,
  });

  console.log("  AI response parsed successfully");

  await saveTopPicks(profile.id, recommendations);

  if (recommendations.length === TARGET_RECOMMENDATION_COUNT) {
    console.log("  Top picks saved successfully.");
  } else {
    console.log(
      `  Top picks saved with warning: expected ${TARGET_RECOMMENDATION_COUNT}, got ${recommendations.length}.`
    );
  }

  for (const warning of warnings) {
    console.log(`  ${warning}`);
  }

  console.log(
    `  Saved ${recommendations.length} picks (${formatCategorySummary(recommendations)}).`
  );
}

async function main() {
  const profileSlugArg = process.argv.find((arg) => arg.startsWith("--profile="));
  const profileSlug = profileSlugArg?.split("=")[1] ?? null;

  const profiles = await getProfiles(profileSlug);

  if (!profiles.length) {
    console.log(
      profileSlug
        ? `No profile found for slug: ${profileSlug}`
        : "No profiles found."
    );
    return;
  }

  const allFilms = await getAllFilms();

  if (!allFilms.length) {
    console.log("No films found.");
    return;
  }

  console.log(`Loaded ${allFilms.length} films from database.`);

  for (const profile of profiles) {
    await generateForProfile(profile, allFilms);
  }

  console.log("\nDone: top picks generated.\n");
}

main().catch((error) => {
  console.error("\nGenerate top picks failed.\n", error);
  process.exit(1);
});
