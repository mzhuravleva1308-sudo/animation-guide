import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env variables");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

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

function effectiveSimilarity(similarity) {
  const threshold = 0.72;

  if (similarity <= threshold) {
    return 0;
  }

  return (similarity - threshold) / (1 - threshold);
}

async function getProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, slug, name")
    .order("slug");

  if (error) throw error;

  return data ?? [];
}

async function getLikedFilms(profileId) {
  const { data, error } = await supabase
    .from("film_ratings")
    .select(
      `
      rating,
      films (
        id,
        title,
        moods,
        aesthetic_tags
      )
    `
    )
    .eq("profile_id", profileId)
    .gte("rating", 7);

  if (error) throw error;

  return (data ?? [])
    .filter((item) => item.films)
    .map((item) => ({
      ...item.films,
      rating: item.rating,
    }))
    .sort((a, b) => {
      const ratingDiff = Number(b.rating ?? 0) - Number(a.rating ?? 0);

      if (ratingDiff !== 0) {
        return ratingDiff;
      }

      return String(a.title ?? "").localeCompare(String(b.title ?? ""));
    });
}

async function getFilmEmbeddings(tableName, filmIds) {
  if (!filmIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("film_id, embedding")
    .in("film_id", filmIds);

  if (error) throw error;

  return new Map(
    (data ?? []).map((item) => [item.film_id, parseEmbedding(item.embedding)])
  );
}

async function getMoodEmbeddings(tags) {
  if (!tags.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("mood_embeddings")
    .select("mood, embedding")
    .in("mood", tags);

  if (error) throw error;

  return new Map(
    (data ?? []).map((item) => [
      normalizeTag(item.mood),
      parseEmbedding(item.embedding),
    ])
  );
}

function getOldOrderTags(films, tagField) {
  const tags = [];

  for (const film of films) {
    for (const tag of (film[tagField] ?? []).map(normalizeTag)) {
      if (!tag) continue;

      if (!tags.includes(tag)) {
        tags.push(tag);
      }

      if (tags.length >= 10) {
        return tags;
      }
    }
  }

  return tags;
}

function getFrequencyTags(films, tagField) {
  const stats = new Map();

  for (const film of films) {
    const tags = Array.from(
      new Set((film[tagField] ?? []).map(normalizeTag).filter(Boolean))
    );

    for (const tag of tags) {
      const current = stats.get(tag) ?? {
        tag,
        frequency: 0,
        weightedFrequency: 0,
      };

      current.frequency += 1;
      current.weightedFrequency += ratingWeight(Number(film.rating ?? 0));

      stats.set(tag, current);
    }
  }

  return Array.from(stats.values()).sort((a, b) => {
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }

    return b.weightedFrequency - a.weightedFrequency;
  });
}

function getDensityTags({
    films,
    tagField,
    tagEmbeddingByTag,
  }) {
    const tagStats = new Map();
  
    for (const film of films) {
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
  
    const tags = Array.from(tagStats.values());
    const rows = [];
  
    for (const tagA of tags) {
      const embeddingA = tagEmbeddingByTag.get(tagA.tag);
  
      if (!embeddingA) {
        rows.push({
          tag: tagA.tag,
          frequency: tagA.frequency,
          weightedFrequency: tagA.weightedFrequency,
          density: 0,
          directSupport: 0,
          finalScore: 0,
          missingEmbedding: true,
        });
        continue;
      }
  
      let density = 0;
      const neighbors = [];
  
      for (const tagB of tags) {
        if (tagA.tag === tagB.tag) {
          continue;
        }
  
        const embeddingB = tagEmbeddingByTag.get(tagB.tag);
  
        if (!embeddingB) {
          continue;
        }
  
        const similarity = cosineSimilarity(embeddingA, embeddingB);
        const effective = effectiveSimilarity(similarity);
  
        const contribution = effective * tagB.weightedFrequency;
  
        density += contribution;
  
        if (effective > 0) {
          neighbors.push({
            tag: tagB.tag,
            frequency: tagB.frequency,
            weighted: Number(tagB.weightedFrequency.toFixed(2)),
            similarity: Number(similarity.toFixed(3)),
            effective: Number(effective.toFixed(3)),
            contribution: Number(contribution.toFixed(4)),
          });
        }
      }
  
      rows.push({
        tag: tagA.tag,
        frequency: tagA.frequency,
        weightedFrequency: tagA.weightedFrequency,
        density,
        directSupport: 0,
        finalScore: density,
        missingEmbedding: false,
        neighbors: neighbors.sort((a, b) => b.contribution - a.contribution),
      });
    }
  
    return rows.sort((a, b) => b.finalScore - a.finalScore);
  }

  function average(numbers) {
    if (!numbers.length) {
      return 0;
    }
  
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }
  function pruneCluster(clusterTags, getSimilarity) {
    let currentCluster = [...clusterTags];
  
    let changed = true;
  
    while (changed && currentCluster.length >= 4) {
      changed = false;
  
      const scoredTags = currentCluster.map((tagItem) => {
        const otherTags = currentCluster.filter(
          (otherItem) => otherItem.tag !== tagItem.tag
        );
  
        const similarities = otherTags.map((otherItem) =>
          getSimilarity(tagItem.tag, otherItem.tag)
        );
  
        const strongConnections = similarities.filter(
          (similarity) => similarity >= 0.82
        ).length;
  
        const connectionRatio =
          otherTags.length > 0 ? strongConnections / otherTags.length : 0;
  
        const averageSimilarity = average(similarities);
  
        return {
          tagItem,
          connectionRatio,
          averageSimilarity,
          strongConnections,
        };
      });
  
      const weakestTag = scoredTags
        .filter(() => currentCluster.length > 4)
        .sort((a, b) => {
          if (a.connectionRatio !== b.connectionRatio) {
            return a.connectionRatio - b.connectionRatio;
          }
  
          return a.averageSimilarity - b.averageSimilarity;
        })[0];
  
      if (
        weakestTag &&
        (weakestTag.connectionRatio < 0.55 ||
          weakestTag.averageSimilarity < 0.81)
      ) {
        currentCluster = currentCluster.filter(
          (item) => item.tag !== weakestTag.tagItem.tag
        );
        changed = true;
      }
    }
  
    return currentCluster;
  }

  function getStoneClusters({ films, tagField, tagEmbeddingByTag }) {
    const tagStats = new Map();
  
    for (const film of films) {
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
        pairSimilarities,
      });
    }
  
    return candidateClusters
  .sort((a, b) => b.finalScore - a.finalScore)
  .slice(0, 15);
  }

  function getTagsByClusterPresence(clusters, films, tagField) {
    const filmTagStats = new Map();
  
    for (const film of films) {
      const weight = ratingWeight(Number(film.rating ?? 0));
  
      if (weight <= 0) {
        continue;
      }
  
      const tags = Array.from(
        new Set((film[tagField] ?? []).map(normalizeTag).filter(Boolean))
      );
  
      for (const tag of tags) {
        const current = filmTagStats.get(tag) ?? {
          frequency: 0,
          weightedFrequency: 0,
        };
  
        current.frequency += 1;
        current.weightedFrequency += weight;
  
        filmTagStats.set(tag, current);
      }
    }
  
    const tagStats = new Map();
  
    for (const cluster of clusters) {
      for (const tag of cluster.tags) {
        const current = tagStats.get(tag) ?? {
          tag,
          clusterCount: 0,
          clusterScore: 0,
          filmFrequency: 0,
          weightedFrequency: 0,
          signatureScore: 0,
        };
  
        const filmStats = filmTagStats.get(tag) ?? {
          frequency: 0,
          weightedFrequency: 0,
        };
  
        current.clusterCount += 1;
        current.clusterScore += cluster.finalScore;
        current.filmFrequency = filmStats.frequency;
        current.weightedFrequency = filmStats.weightedFrequency;
        current.signatureScore =
          current.clusterScore * Math.sqrt(current.weightedFrequency || 0);
  
        tagStats.set(tag, current);
      }
    }
  
    return Array.from(tagStats.values()).sort((a, b) => {
      if (b.signatureScore !== a.signatureScore) {
        return b.signatureScore - a.signatureScore;
      }
  
      if (b.clusterCount !== a.clusterCount) {
        return b.clusterCount - a.clusterCount;
      }
  
      return b.weightedFrequency - a.weightedFrequency;
    });
  }

  function getFilmTagStats(films, tagField) {
    const tagStats = new Map();
  
    for (const film of films) {
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
  
  function buildProfileLineDebug({
    filmTagStats,
    stoneClusters,
    tagEmbeddingByTag,
  }) {
    const tagsByFrequency = Array.from(filmTagStats.values()).sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
  
      return b.weightedFrequency - a.weightedFrequency;
    });
  
    const anchor = tagsByFrequency[0];
  
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
  
    const contrastCandidates = tagsByFrequency
      .filter((item) => !selectedSet.has(item.tag))
      .map((item) => {
        const similaritiesToLine = getSimilaritiesToLine(
          item.tag,
          lineTags,
          tagEmbeddingByTag
        );
  
        const maxSimilarityToLine = similaritiesToLine[0]?.similarity ?? 0;
        const top2Average = average(
          similaritiesToLine.slice(0, 2).map((row) => row.similarity)
        );
  
        return {
          ...item,
          maxSimilarityToLine,
          top2Average,
          nearestLineTags: similaritiesToLine
            .slice(0, 3)
            .map((row) => `${row.tag}:${row.similarity.toFixed(3)}`),
        };
      })
      .filter((item) => item.frequency >= 2)
      .sort((a, b) => {
        if (b.frequency !== a.frequency) {
          return b.frequency - a.frequency;
        }
  
        return a.maxSimilarityToLine - b.maxSimilarityToLine;
      });
  
    const contrastTags = contrastCandidates.slice(0, 2).map((item) => item.tag);
  
    for (const tag of contrastTags) {
      selectedSet.add(tag);
    }
  
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
      nearestLineTags: similaritiesToLine
        .slice(0, 3)
        .map((row) => `${row.tag}:${row.similarity.toFixed(3)}`),
    };
  })
  .filter((item) => item.nonAnchorTop2Average >= 0.82)
  .filter((item) => item.frequency <= 1)
  .sort((a, b) => b.accentScore - a.accentScore);
  
    const accentTags = accentCandidates.slice(0, 2).map((item) => item.tag);
  
    const signature = [
      anchor.tag,
      ...lineTags.filter((tag) => tag !== anchor.tag),
      ...contrastTags,
      ...accentTags,
    ];
  
    return {
      anchor: anchor.tag,
      anchorCluster,
      lineTags,
      contrastCandidates,
      contrastTags,
      accentCandidates,
      accentTags,
      signature: Array.from(new Set(signature)).slice(0, 10),
    };
  }

  function getGraphClusters({ films, tagField, tagEmbeddingByTag }) {
    const SIMILARITY_THRESHOLD = 0.82;
  
    const tagStats = new Map();
  
    for (const film of films) {
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
  
    const tags = Array.from(tagStats.values()).filter((tag) =>
      tagEmbeddingByTag.has(tag.tag)
    );
  
    function getSimilarity(tagA, tagB) {
      const embeddingA = tagEmbeddingByTag.get(tagA);
      const embeddingB = tagEmbeddingByTag.get(tagB);
  
      return embeddingA && embeddingB
        ? cosineSimilarity(embeddingA, embeddingB)
        : 0;
    }


    const graph = new Map();
  
    for (const tag of tags) {
      graph.set(tag.tag, new Set());
    }
  
    const edges = [];
  
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const tagA = tags[i].tag;
        const tagB = tags[j].tag;
        const similarity = getSimilarity(tagA, tagB);
  
        if (similarity >= SIMILARITY_THRESHOLD) {
          graph.get(tagA).add(tagB);
          graph.get(tagB).add(tagA);
  
          edges.push({
            tagA,
            tagB,
            similarity,
          });
        }
      }
    }
  
    const visited = new Set();
    const components = [];
  
    for (const tag of graph.keys()) {
      if (visited.has(tag)) {
        continue;
      }
  
      const stack = [tag];
      const componentTags = [];
  
      visited.add(tag);
  
      while (stack.length) {
        const current = stack.pop();
        componentTags.push(current);
  
        for (const neighbor of graph.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            stack.push(neighbor);
          }
        }
      }
  
      if (componentTags.length < 2) {
        continue;
      }
  
      const componentTagSet = new Set(componentTags);
  
      const componentStats = componentTags
        .map((tagName) => tagStats.get(tagName))
        .filter(Boolean);
  
      const internalEdges = edges.filter(
        (edge) =>
          componentTagSet.has(edge.tagA) && componentTagSet.has(edge.tagB)
      );
  
      const possibleEdges =
        (componentTags.length * (componentTags.length - 1)) / 2;
  
      const graphDensity =
        possibleEdges > 0 ? internalEdges.length / possibleEdges : 0;
  
      const averageSimilarity = internalEdges.length
        ? average(internalEdges.map((edge) => edge.similarity))
        : 0;
  
      const support = componentStats.reduce(
        (sum, item) => sum + item.weightedFrequency,
        0
      );
  
      const frequency = componentStats.reduce(
        (sum, item) => sum + item.frequency,
        0
      );
  
      const finalScore =
        graphDensity * averageSimilarity * Math.sqrt(support) * Math.log1p(frequency);
  
      components.push({
        tags: componentStats
          .sort((a, b) => {
            if (b.weightedFrequency !== a.weightedFrequency) {
              return b.weightedFrequency - a.weightedFrequency;
            }
  
            return a.tag.localeCompare(b.tag);
          })
          .map((item) => item.tag),
        size: componentTags.length,
        graphDensity,
        averageSimilarity,
        support,
        frequency,
        edgeCount: internalEdges.length,
        possibleEdges,
        finalScore,
        edges: internalEdges.sort((a, b) => b.similarity - a.similarity),
      });
    }
  
    return components.sort((a, b) => b.finalScore - a.finalScore);
  }

function printTagTable(title, rows) {
  console.log(`\n${title}`);
  console.table(
    rows.slice(0, 15).map((item) => ({
      tag: item.tag,
      frequency: item.frequency,
      weighted: Number((item.weightedFrequency ?? 0).toFixed(2)),
      density: Number((item.density ?? 0).toFixed(4)),
      direct: Number((item.directSupport ?? 0).toFixed(4)),
      final: Number((item.finalScore ?? 0).toFixed(4)),
      missingEmbedding: item.missingEmbedding ?? false,
    }))
  );
}

async function analyzeProfile(profile) {
  const films = await getLikedFilms(profile.id);
  const filmIds = films.map((film) => film.id);

  const filmMoodEmbeddingById = await getFilmEmbeddings(
    "film_mood_embeddings",
    filmIds
  );

  const filmAestheticEmbeddingById = await getFilmEmbeddings(
    "film_aesthetic_embeddings",
    filmIds
  );

  const emotionalTags = Array.from(
    new Set(films.flatMap((film) => (film.moods ?? []).map(normalizeTag)))
  ).filter(Boolean);

  const aestheticTags = Array.from(
    new Set(
      films.flatMap((film) => (film.aesthetic_tags ?? []).map(normalizeTag))
    )
  ).filter(Boolean);

  const moodEmbeddingByTag = await getMoodEmbeddings(emotionalTags);

  const emotionalGraphClusters = getGraphClusters({
    films,
    tagField: "moods",
    tagEmbeddingByTag: moodEmbeddingByTag,
  });
  
  console.log("\nEMOTIONAL — graph clusters:");
  for (const cluster of emotionalGraphClusters) {
    console.log(`\ntags: ${cluster.tags.join(", ")}`);
    console.log(
      `size: ${cluster.size} | graphDensity: ${cluster.graphDensity.toFixed(
        4
      )} | avgSim: ${cluster.averageSimilarity.toFixed(
        4
      )} | support: ${cluster.support.toFixed(
        2
      )} | edges: ${cluster.edgeCount}/${cluster.possibleEdges} | final: ${cluster.finalScore.toFixed(
        4
      )}`
    );
  }

  console.log("\nDEBUG emotionalTags:", emotionalTags);
console.log("DEBUG mood embeddings found:", moodEmbeddingByTag.size);
console.log(
  "DEBUG missing mood embeddings:",
  emotionalTags.filter((tag) => !moodEmbeddingByTag.has(tag))
); 
  // Важно: для aesthetic пока нет отдельных tag embeddings.
  // Поэтому density для aesthetic сейчас считаем не можем корректно.
  // Для aesthetic сравним old order и frequency.
  console.log("\n\n==================================================");
  console.log(`PROFILE: ${profile.slug}`);
  console.log(`Liked films: ${films.length}`);
  console.log("==================================================");


  console.log("\nEMOTIONAL — old order top 10:");
  console.log(getOldOrderTags(films, "moods").join(", "));

  console.log("\nEMOTIONAL — frequency top 10:");
  console.log(
    getFrequencyTags(films, "moods")
      .slice(0, 10)
      .map((item) => item.tag)
      .join(", ")
  );

  const emotionalDensityRows = getDensityTags({
    films,
    tagField: "moods",
    tagEmbeddingByTag: moodEmbeddingByTag,
  });

  printTagTable("EMOTIONAL — density top 15", emotionalDensityRows);

  console.log("\nEMOTIONAL — density top 10:");
  console.log(
    emotionalDensityRows
      .slice(0, 10)
      .map((item) => item.tag)
      .join(", ")
  );
  const emotionalStoneClusters = getStoneClusters({
    films,
    tagField: "moods",
    tagEmbeddingByTag: moodEmbeddingByTag,
  });
  
  console.log("\nEMOTIONAL — stone clusters:");
  for (const cluster of emotionalStoneClusters) {
    console.log(
      `\nanchor: ${cluster.anchor}`
    );
    console.log(`tags: ${cluster.tags.join(", ")}`);
    if (cluster.removedTags?.length) {
        console.log(`removed: ${cluster.removedTags.join(", ")}`);
      }
    console.log(
      `density: ${cluster.clusterDensity.toFixed(4)} | support: ${cluster.clusterSupport.toFixed(
        2
      )} | final: ${cluster.finalScore.toFixed(4)}`
    );
  }

  const tagsByClusterPresence = getTagsByClusterPresence(
    emotionalStoneClusters,
    films,
    "moods"
  );

console.log("\nEMOTIONAL — tags by stone cluster presence:");
console.table(
  tagsByClusterPresence.slice(0, 15).map((item) => ({
    tag: item.tag,
    clusterCount: item.clusterCount,
    clusterScore: Number(item.clusterScore.toFixed(4)),
  }))
);

console.log("\nEMOTIONAL — stone signature top 10:");
console.log(
  tagsByClusterPresence
    .slice(0, 10)
    .map((item) => item.tag)
    .join(", ")
);

const emotionalFilmTagStats = getFilmTagStats(films, "moods");
  
const profileLineDebug = buildProfileLineDebug({
  filmTagStats: emotionalFilmTagStats,
  stoneClusters: emotionalStoneClusters,
  tagEmbeddingByTag: moodEmbeddingByTag,
});

console.log("\nEMOTIONAL — profile line debug:");
console.log("anchor:", profileLineDebug.anchor);

console.log("\nanchor cluster:");
console.log(profileLineDebug.anchorCluster);

console.log("\nline tags:");
console.log(profileLineDebug.lineTags.join(", "));

console.log("\ncontrast candidates:");
console.table(
  profileLineDebug.contrastCandidates.slice(0, 10).map((item) => ({
    tag: item.tag,
    frequency: item.frequency,
    weighted: Number(item.weightedFrequency.toFixed(2)),
    maxToLine: Number(item.maxSimilarityToLine.toFixed(4)),
    top2Avg: Number(item.top2Average.toFixed(4)),
    nearestLineTags: item.nearestLineTags.join(", "),
  }))
);

console.log("\ncontrast tags:");
console.log(profileLineDebug.contrastTags.join(", "));

console.log("\naccent candidates:");
console.table(
  profileLineDebug.accentCandidates.slice(0, 10).map((item) => ({
    tag: item.tag,
    frequency: item.frequency,
    weighted: Number(item.weightedFrequency.toFixed(2)),
    top2Avg: Number(item.top2Average.toFixed(4)),
    maxToLine: Number(item.maxSimilarityToLine.toFixed(4)),
    accentScore: Number(item.accentScore.toFixed(4)),
    nearestLineTags: item.nearestLineTags.join(", "),
    nonAnchorTop2: Number(item.nonAnchorTop2Average.toFixed(4)),
  }))
);

console.log("\naccent tags:");
console.log(profileLineDebug.accentTags.join(", "));

console.log("\nEMOTIONAL — final profile line signature:");
console.log(profileLineDebug.signature.join(", "));

  console.log("\nAESTHETIC — old order top 10:");
  console.log(getOldOrderTags(films, "aesthetic_tags").join(", "));

  console.log("\nAESTHETIC — frequency top 10:");
  console.log(
    getFrequencyTags(films, "aesthetic_tags")
      .slice(0, 10)
      .map((item) => item.tag)
      .join(", ")
  );
}

async function main() {
    const profiles = await getProfiles();
  
    const selectedProfiles = profiles.filter((profile) =>
      ["maria", "anton"].includes(profile.slug)
    );
  
    for (const profile of selectedProfiles) {
      await analyzeProfile(profile);
    }
  }

main().catch((error) => {
  console.error(error);
  process.exit(1);
});