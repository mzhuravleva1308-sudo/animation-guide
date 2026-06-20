import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env variables");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const GENERIC_EMOTIONAL_TAGS = new Set([
  "emotional",
  "atmospheric",
  "poetic",
  "sad",
  "dreamy",
]);

const GENERIC_AESTHETIC_TAGS = new Set([
  "visual",
  "artistic",
  "dreamlike",
  "stylized",
]);

function average(numbers) {
    if (!numbers.length) {
      return 0;
    }
  
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }
  
  function getSimilaritiesToLine(tag, lineTags, tagEmbeddingByTag) {
    const embeddingA = tagEmbeddingByTag.get(tag);
  
    if (!embeddingA) {
      return [];
    }
  
    return lineTags
      .filter((lineTag) => lineTag !== tag)
      .map((lineTag) => {
        const embeddingB = tagEmbeddingByTag.get(lineTag);
  
        if (!embeddingB) {
          return null;
        }
  
        return {
          tag: lineTag,
          similarity: cosineSimilarity(embeddingA, embeddingB),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.similarity - a.similarity);
  }

function normalizeTag(tag) {
  return String(tag ?? "").trim().toLowerCase();
}

function ratingWeight(rating) {
  if (rating >= 10) return 1;
  if (rating >= 9) return 0.9;
  if (rating >= 8) return 0.8;
  if (rating >= 7) return 0.55;
  return 0;
}

function buildSignatureTags(likedFilms, tagField, genericTags) {
  const tagStats = new Map();

  for (const film of likedFilms) {
    const weight = ratingWeight(Number(film.rating ?? 0));

    if (weight <= 0) {
      continue;
    }

    const tags = Array.from(
      new Set((film[tagField] ?? []).map(normalizeTag).filter(Boolean))
    );

    for (const tag of tags) {
      if (genericTags.has(tag)) {
        continue;
      }

      const current = tagStats.get(tag) ?? {
        tag,
        score: 0,
        filmCount: 0,
        likedFilms: [],
      };

      current.score += weight;
      current.filmCount += 1;
      current.likedFilms.push(film.title);

      tagStats.set(tag, current);
    }
  }

  return Array.from(tagStats.values())
    .sort((a, b) => {
      if (b.filmCount !== a.filmCount) {
        return b.filmCount - a.filmCount;
      }

      return b.score - a.score;
    })
    .slice(0, 12)
    .map((item) => item.tag);
}

function cosineSimilarity(a, b) {
    if (!a?.length || !b?.length || a.length !== b.length) {
      return 0;
    }
  
    let dot = 0;
    let normA = 0;
    let normB = 0;
  
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
  
    if (normA === 0 || normB === 0) {
      return 0;
    }
  
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
function getStoneClusters({ likedFilms, tagField, tagEmbeddingByTag }) {
    const tagStats = new Map();
  
    for (const film of likedFilms) {
      const weight = ratingWeight(Number(film.rating ?? 0));
  
      if (weight <= 0) {
        continue;
      }
  
      const filmTags = Array.from(
        new Set((film[tagField] ?? []).map(normalizeTag).filter(Boolean))
      );
  
      for (const tag of filmTags) {
        const current = tagStats.get(tag) ?? {
          tag,
          frequency: 0,
          weightedFrequency: 0,
        };
  
        current.frequency += 1;
        current.weightedFrequency += weight;
  
        tagStats.set(tag, current);
      }
    }
  
    const tags = Array.from(tagStats.values()).filter((tag) =>
      tagEmbeddingByTag.has(tag.tag)
    );
  
    const similarityByPair = new Map();
  
    function getSimilarity(tagA, tagB) {
      const key = [tagA, tagB].sort().join("::");
  
      if (similarityByPair.has(key)) {
        return similarityByPair.get(key);
      }
  
      const embeddingA = tagEmbeddingByTag.get(tagA);
      const embeddingB = tagEmbeddingByTag.get(tagB);
  
      const similarity =
        embeddingA && embeddingB ? cosineSimilarity(embeddingA, embeddingB) : 0;
  
      similarityByPair.set(key, similarity);
  
      return similarity;
    }
  
    const candidateClusters = [];
  
    for (const anchor of tags) {
      const candidates = tags
        .filter((item) => item.tag !== anchor.tag)
        .map((item) => ({
          ...item,
          similarityToAnchor: getSimilarity(anchor.tag, item.tag),
        }))
        .filter((item) => item.similarityToAnchor >= 0.8)
        .sort((a, b) => b.similarityToAnchor - a.similarityToAnchor);
  
      const clusterTags = [anchor];
  
      for (const candidate of candidates) {
        if (clusterTags.length >= 6) {
          break;
        }
  
        const similaritiesToCluster = clusterTags.map((clusterTag) =>
          getSimilarity(candidate.tag, clusterTag.tag)
        );
  
        const averageSimilarityToCluster = average(similaritiesToCluster);
  
        const strongConnectionRatio =
          similaritiesToCluster.filter((similarity) => similarity >= 0.82)
            .length / similaritiesToCluster.length;
  
        if (
          averageSimilarityToCluster >= 0.82 &&
          strongConnectionRatio >= 0.65
        ) {
          clusterTags.push(candidate);
        }
      }
  
      if (clusterTags.length < 4) {
        continue;
      }
  
      const pairSimilarities = [];
  
      for (let i = 0; i < clusterTags.length; i += 1) {
        for (let j = i + 1; j < clusterTags.length; j += 1) {
          pairSimilarities.push(
            getSimilarity(clusterTags[i].tag, clusterTags[j].tag)
          );
        }
      }
  
      const clusterDensity = average(pairSimilarities);
  
      const clusterSupport = clusterTags.reduce(
        (sum, item) => sum + item.weightedFrequency,
        0
      );
  
      const clusterFrequency = clusterTags.reduce(
        (sum, item) => sum + item.frequency,
        0
      );
  
      const finalScore =
        clusterDensity * Math.sqrt(clusterSupport) * Math.log1p(clusterFrequency);
  
      candidateClusters.push({
        anchor: anchor.tag,
        tags: clusterTags
          .sort((a, b) => {
            if (b.weightedFrequency !== a.weightedFrequency) {
              return b.weightedFrequency - a.weightedFrequency;
            }
  
            return a.tag.localeCompare(b.tag);
          })
          .map((item) => item.tag),
        clusterDensity,
        clusterSupport,
        clusterFrequency,
        finalScore,
      });
    }
  
    return candidateClusters
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 15);
  }

function buildProfileLineSignature({
    filmTagStats,
    stoneClusters,
    tagEmbeddingByTag,
    limit = 10,
  }) {
    const tagsByFrequency = Array.from(filmTagStats.values()).sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
  
      return b.weightedFrequency - a.weightedFrequency;
    });
  
    const anchor = tagsByFrequency[0];
  
    if (!anchor) {
      return [];
    }
  
    const anchorCluster =
      stoneClusters.find((cluster) => cluster.anchor === anchor.tag) ??
      stoneClusters[0];
  
    const initialLineTags = anchorCluster?.tags ?? [anchor.tag];
  
    const frequentCandidates = tagsByFrequency
      .filter((item) => item.tag !== anchor.tag)
      .filter((item) => item.frequency >= 3);
  
    const lineTagSet = new Set(initialLineTags);
  
    for (const candidate of frequentCandidates) {
      const similaritiesToLine = getSimilaritiesToLine(
        candidate.tag,
        Array.from(lineTagSet),
        tagEmbeddingByTag
      );
  
      const top2 = similaritiesToLine.slice(0, 2);
      const top2Average = average(top2.map((item) => item.similarity));
  
      if (top2Average >= 0.78) {
        lineTagSet.add(candidate.tag);
      }
    }
  
    const lineTags = Array.from(lineTagSet);
    const selectedSet = new Set(lineTags);
  
    const accentCandidates = tagsByFrequency
      .filter((item) => !selectedSet.has(item.tag))
      .map((item) => {
        const similaritiesToLine = getSimilaritiesToLine(
          item.tag,
          lineTags,
          tagEmbeddingByTag
        );
  
        const top2 = similaritiesToLine.slice(0, 2);
        const top2Average = average(top2.map((row) => row.similarity));
        const maxSimilarityToLine = similaritiesToLine[0]?.similarity ?? 0;
  
        const nonAnchorSimilarities = similaritiesToLine.filter(
          (row) => row.tag !== anchor.tag
        );
  
        const nonAnchorTop2 = nonAnchorSimilarities.slice(0, 2);
  
        const nonAnchorTop2Average = average(
          nonAnchorTop2.map((row) => row.similarity)
        );
  
        const attachmentScore =
          nonAnchorTop2Average * (1 - Math.abs(maxSimilarityToLine - 0.86));
  
        const accentScore =
          item.weightedFrequency *
          Math.sqrt(item.frequency) *
          attachmentScore;
  
        return {
          ...item,
          top2Average,
          nonAnchorTop2Average,
          maxSimilarityToLine,
          attachmentScore,
          accentScore,
        };
      })
      .filter((item) => item.nonAnchorTop2Average >= 0.82)
      .filter((item) => item.frequency <= 1)
      .sort((a, b) => b.accentScore - a.accentScore);
  
    const accentTags = accentCandidates.slice(0, 2).map((item) => item.tag);
  
    const signature = [
      anchor.tag,
      ...lineTags.filter((tag) => tag !== anchor.tag),
      ...accentTags,
    ];
  
    return Array.from(new Set(signature)).slice(0, limit);
  }

async function getProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, slug, name")
    .order("slug");

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
      .gte("rating", 7);
  
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
      .select("id, title, moods, aesthetic_tags")
      .in("id", filmIds);
  
    if (filmsError) {
      throw filmsError;
    }
  
    return (films ?? [])
      .map((film) => ({
        ...film,
        rating: ratingByFilmId.get(film.id),
      }))
      .sort((a, b) => {
        const ratingDiff = Number(b.rating ?? 0) - Number(a.rating ?? 0);
  
        if (ratingDiff !== 0) {
          return ratingDiff;
        }
  
        return String(a.title ?? "").localeCompare(String(b.title ?? ""));
      });
  }

async function updateProfileCores(profileId, emotionalTags, aestheticTags) {
    
  const { error: emotionalError } = await supabase
    .from("profile_taste_cores")
    .update({
      emotional_profile_tags: emotionalTags,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .eq("core_type", "emotional");

  if (emotionalError) {
    throw emotionalError;
  }

  const { error: aestheticError } = await supabase
    .from("profile_taste_cores")
    .update({
      aesthetic_profile_tags: aestheticTags,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .eq("core_type", "aesthetic");

  if (aestheticError) {
    throw aestheticError;
  }
}

function parseEmbedding(value) {
    if (!value) return null;
  
    if (Array.isArray(value)) {
      return value.map(Number);
    }
  
    if (typeof value === "string") {
      return value
        .replace("[", "")
        .replace("]", "")
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item));
    }
  
    return null;
  }
  
  async function getMoodEmbeddings(tags) {
    if (!tags.length) {
      return new Map();
    }
  
    const { data, error } = await supabase
      .from("mood_embeddings")
      .select("mood, embedding")
      .in("mood", tags);
  
    if (error) {
      throw error;
    }
  
    return new Map(
      (data ?? []).map((item) => [
        normalizeTag(item.mood),
        parseEmbedding(item.embedding),
      ])
    );
  }

  function getFilmTagStats(likedFilms, tagField) {
    const tagStats = new Map();
  
    for (const film of likedFilms) {
      const weight = ratingWeight(Number(film.rating ?? 0));
  
      if (weight <= 0) {
        continue;
      }
  
      const tags = Array.from(
        new Set((film[tagField] ?? []).map(normalizeTag).filter(Boolean))
      );
  
      for (const tag of tags) {
        const current = tagStats.get(tag) ?? {
          tag,
          frequency: 0,
          weightedFrequency: 0,
        };
  
        current.frequency += 1;
        current.weightedFrequency += weight;
  
        tagStats.set(tag, current);
      }
    }
  
    return tagStats;
  }

async function main() {
  const profiles = await getProfiles();

  console.log(`Found ${profiles.length} profiles`);

  for (const profile of profiles) {
    const likedFilms = await getLikedFilms(profile.id);


    const aestheticTags = buildSignatureTags(
      likedFilms,
      "aesthetic_tags",
      GENERIC_AESTHETIC_TAGS
    );

    const emotionalTags = Array.from(
        new Set(likedFilms.flatMap((film) => (film.moods ?? []).map(normalizeTag)))
      ).filter(Boolean);
      
      const moodEmbeddingByTag = await getMoodEmbeddings(emotionalTags);
      
      const emotionalFilmTagStats = getFilmTagStats(likedFilms, "moods");
      
      const emotionalStoneClusters = getStoneClusters({
        likedFilms,
        tagField: "moods",
        tagEmbeddingByTag: moodEmbeddingByTag,
      });
      
      const emotionalProfileTags = buildProfileLineSignature({
        filmTagStats: emotionalFilmTagStats,
        stoneClusters: emotionalStoneClusters,
        tagEmbeddingByTag: moodEmbeddingByTag,
        limit: 10,
      });
      
      // aesthetic пока оставляешь как было
      await updateProfileCores(
        profile.id,
        emotionalProfileTags,
        aestheticTags
      );

    console.log(`\n${profile.slug}`);
    console.log(`Liked films: ${likedFilms.length}`);
    console.log(`Emotional: ${emotionalProfileTags.join(", ")}`);
    console.log(`Aesthetic: ${aestheticTags.join(", ")}`);
  }

  console.log("\nDone");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});