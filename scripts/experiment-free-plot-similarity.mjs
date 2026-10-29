#!/usr/bin/env node
/**
 * Offline experiment: Plot Similarity without controlled vocabulary.
 *
 * Compares three approaches on the same 50-film dry-run sample:
 *   A) Controlled Plot Tags → one embedding per film (production text format)
 *   B) Free plot elements → one film embedding
 *   C) Free plot elements → per-element embeddings + symmetric best-match
 *
 * Does NOT write production tables, change ranking, or touch Mood/Visual.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-free-plot-similarity.mjs
 *   APP_ENV=hosted node scripts/experiment-free-plot-similarity.mjs --skip-generate
 *     (reuse tmp/.../free-elements.json if present)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";

await applyAppEnv({ prefer: "hosted" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "experiment-free-plot-similarity");
const SOURCE_LIST = path.join(
  REPO_ROOT,
  "tmp",
  "animation-plot-tags-review-50-v3.json"
);

const skipGenerate = process.argv.includes("--skip-generate");
const TOP_K = 5;
const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const TAG_MODEL = process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini";

const COMMON_GENERIC = new Set([
  "friendship",
  "family loss",
  "coping with loss",
  "finding belonging",
  "searching for identity",
  "building trust",
  "uncovering secrets",
  "confronting danger",
  "accepting change",
  "facing oppression",
  "overcoming circumstances",
  "shared journey",
  "survival",
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Could not parse JSON: ${text.slice(0, 200)}`);
    return JSON.parse(match[0]);
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function jaccard(a, b) {
  const setA = new Set((a || []).map((t) => String(t).toLowerCase()));
  const setB = new Set((b || []).map((t) => String(t).toLowerCase()));
  if (!setA.size && !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  return inter / (setA.size + setB.size - inter);
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return results;
}

async function embedBatch(texts) {
  /** @type {number[][]} */
  const out = [];
  const chunkSize = 64;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const response = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: chunk,
    });
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    for (const row of ordered) out.push(row.embedding);
  }
  return out;
}

function buildControlledEmbedText(tags) {
  const normalized = [...new Set((tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].sort();
  return `animated film storytelling: ${normalized.join(", ")}`;
}

function buildFreeFilmEmbedText(elements) {
  return `animated film plot: ${(elements || []).join("; ")}`;
}

const FREE_SYSTEM = `You extract free Plot Elements for an animation recommendation experiment.
Plot = concrete situations, conflicts, relationship developments, and events that happen in the story.

Rules:
- 2–6 short English phrases (typically 3–5). Prefer precision over count.
- Concrete plot situations — not mood, visual style, genre, or vague themes.
- Do NOT use or conform to any controlled vocabulary / tag list.
- Do NOT unify wording across films; phrase what THIS film needs.
- Do NOT retell the synopsis. Do NOT invent events that are not in the film.
- Vary specificity as needed for accuracy (e.g. "involuntary separation" is better than "friendship ends").

Return only JSON: { "plot_elements": ["...", "..."] }`;

async function generateFreeElements(film) {
  const synopsis = film.synopsis || film.what_it_is || "";
  const response = await openai.chat.completions.create({
    model: TAG_MODEL,
    temperature: 0.35,
    messages: [
      { role: "system", content: FREE_SYSTEM },
      {
        role: "user",
        content: `Film: ${film.title} (${film.year ?? "?"})
Director: ${film.director ?? ""}
Synopsis: ${synopsis}
What it is: ${film.what_it_is ?? ""}

Return only JSON: { "plot_elements": ["...", "..."] }`,
      },
    ],
  });
  const parsed = parseJson(response.choices[0]?.message?.content ?? "");
  return (parsed.plot_elements || [])
    .map((e) => String(e).trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Symmetric best-match mean of max pairwise element cosine similarities.
 * @returns {{ score: number, pairs: { a: string, b: string, sim: number }[] }}
 */
function elementBestMatchSimilarity(elementsA, embedsA, elementsB, embedsB) {
  if (!embedsA?.length || !embedsB?.length) {
    return { score: 0, pairs: [] };
  }

  /** @type {{ a: string, b: string, sim: number }[]} */
  const forwardPairs = [];
  let forwardSum = 0;
  for (let i = 0; i < embedsA.length; i += 1) {
    let best = -1;
    let bestJ = 0;
    for (let j = 0; j < embedsB.length; j += 1) {
      const sim = cosineSimilarity(embedsA[i], embedsB[j]);
      if (sim > best) {
        best = sim;
        bestJ = j;
      }
    }
    forwardSum += best;
    forwardPairs.push({
      a: elementsA[i],
      b: elementsB[bestJ],
      sim: best,
    });
  }

  /** @type {{ a: string, b: string, sim: number }[]} */
  const backwardPairs = [];
  let backwardSum = 0;
  for (let j = 0; j < embedsB.length; j += 1) {
    let best = -1;
    let bestI = 0;
    for (let i = 0; i < embedsA.length; i += 1) {
      const sim = cosineSimilarity(embedsB[j], embedsA[i]);
      if (sim > best) {
        best = sim;
        bestI = i;
      }
    }
    backwardSum += best;
    backwardPairs.push({
      a: elementsA[bestI],
      b: elementsB[j],
      sim: best,
    });
  }

  const score =
    (forwardSum / embedsA.length + backwardSum / embedsB.length) / 2;

  // Deduplicate strongest explanatory pairs for the UI
  const pairKey = (p) => `${p.a}|||${p.b}`;
  const merged = new Map();
  for (const p of [...forwardPairs, ...backwardPairs]) {
    const key = pairKey(p);
    const prev = merged.get(key);
    if (!prev || p.sim > prev.sim) merged.set(key, p);
  }
  const pairs = [...merged.values()]
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3);

  return { score, pairs };
}

function topNeighbors(sourceId, scoreMatrix, filmsById, k = TOP_K) {
  const row = scoreMatrix.get(sourceId) ?? new Map();
  return [...row.entries()]
    .filter(([id]) => id !== sourceId)
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([id, payload]) => ({
      id,
      title: filmsById.get(id)?.title ?? id,
      score: payload.score,
      pairs: payload.pairs ?? null,
    }));
}

function buildHtml(payload) {
  const dataJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Plot Similarity Experiment — Free Elements vs Controlled Tags</title>
<style>
  :root {
    --bg: #0f1218;
    --panel: #171b24;
    --line: #2a3140;
    --text: #e8ecf4;
    --muted: #9aa3b5;
    --a: #7eb8ff;
    --b: #8fd6a2;
    --c: #e6b35c;
    --bad: #e88;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1a2438, var(--bg));
    color: var(--text); line-height: 1.45;
  }
  header {
    padding: 28px 24px 12px; max-width: 1200px; margin: 0 auto;
  }
  h1 { font-size: 1.45rem; font-weight: 600; margin: 0 0 8px; }
  .sub { color: var(--muted); font-size: 0.95rem; max-width: 70ch; }
  main { max-width: 1200px; margin: 0 auto; padding: 12px 24px 48px; }
  .controls {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: end;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; padding: 16px; margin-bottom: 18px;
  }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem; color: var(--muted); }
  select, input[type="search"] {
    min-width: 260px; background: #0d1016; color: var(--text);
    border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 0.95rem;
  }
  .elements {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; padding: 16px; margin-bottom: 18px;
  }
  .elements h2 { margin: 0 0 10px; font-size: 1rem; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
  .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    border-radius: 999px; padding: 4px 10px; font-size: 0.8rem;
    background: #222836; border: 1px solid var(--line);
  }
  .chip.free { border-color: #3a5a40; background: #16241c; }
  .chip.ctrl { border-color: #2a4570; background: #152033; }
  .grid3 {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
  }
  @media (max-width: 980px) { .grid3 { grid-template-columns: 1fr; } }
  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; padding: 14px 14px 10px; min-height: 280px;
  }
  .card h3 { margin: 0 0 4px; font-size: 0.95rem; }
  .card .kind { font-size: 0.75rem; color: var(--muted); margin-bottom: 10px; }
  .card.a h3 { color: var(--a); }
  .card.b h3 { color: var(--b); }
  .card.c h3 { color: var(--c); }
  ol { margin: 0; padding-left: 18px; }
  li { margin: 0 0 10px; }
  .score { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 0.85rem; }
  .pairs { margin-top: 4px; font-size: 0.78rem; color: var(--muted); }
  .pairs span { color: #c9d0de; }
  .note { margin-top: 20px; color: var(--muted); font-size: 0.85rem; }
  table.matrix { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 24px; }
  table.matrix th, table.matrix td {
    border-bottom: 1px solid var(--line); padding: 8px 6px; text-align: left; vertical-align: top;
  }
  table.matrix th { color: var(--muted); font-weight: 500; }
</style>
</head>
<body>
<header>
  <h1>Plot Similarity experiment</h1>
  <p class="sub">Offline comparison on 50 films: controlled Plot tags (A) vs free plot elements as a film embedding (B) vs per-element embeddings with symmetric best-match (C). Not production.</p>
</header>
<main>
  <div class="controls">
    <label>Film
      <select id="film"></select>
    </label>
    <label>Filter
      <input id="filter" type="search" placeholder="Type to filter films…"/>
    </label>
  </div>
  <div class="elements" id="elements"></div>
  <div class="grid3" id="neighbors"></div>
  <p class="note">Scores are cosine similarity (A/B) or mean symmetric best-match (C). Higher ≠ always better — judge plot story fit.</p>
  <h2 style="font-size:1rem;margin-top:28px;">All free plot elements</h2>
  <table class="matrix" id="all-elements"></table>
</main>
<script>
const DATA = ${dataJson};
const filmSelect = document.getElementById("film");
const filterInput = document.getElementById("filter");
const elementsEl = document.getElementById("elements");
const neighborsEl = document.getElementById("neighbors");
const allEl = document.getElementById("all-elements");

function fillSelect(q = "") {
  const needle = q.trim().toLowerCase();
  filmSelect.innerHTML = "";
  for (const f of DATA.films) {
    if (needle && !f.title.toLowerCase().includes(needle)) continue;
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.title + (f.year ? " (" + f.year + ")" : "");
    filmSelect.appendChild(opt);
  }
}

function render() {
  const id = filmSelect.value;
  const film = DATA.films.find(f => f.id === id);
  if (!film) return;
  elementsEl.innerHTML = \`
    <h2>\${film.title}</h2>
    <div class="cols">
      <div>
        <div style="color:var(--muted);font-size:0.8rem;margin-bottom:6px">Free plot elements</div>
        <div class="chip-row">\${film.free_elements.map(e => \`<span class="chip free">\${e}</span>\`).join("")}</div>
      </div>
      <div>
        <div style="color:var(--muted);font-size:0.8rem;margin-bottom:6px">Controlled tags (v3 dry-run)</div>
        <div class="chip-row">\${(film.controlled_tags||[]).map(e => \`<span class="chip ctrl">\${e}</span>\`).join("") || "—"}</div>
      </div>
    </div>\`;

  const blocks = [
    { key: "A", cls: "a", title: "A · Controlled tags", kind: "One embedding from controlled Plot Tags" },
    { key: "B", cls: "b", title: "B · Film embedding", kind: "One embedding from joined free elements" },
    { key: "C", cls: "c", title: "C · Element best-match", kind: "Per-element embeddings, symmetric best-match" },
  ];
  neighborsEl.innerHTML = blocks.map(block => {
    const list = film.neighbors[block.key] || [];
    return \`<div class="card \${block.cls}">
      <h3>\${block.title}</h3>
      <div class="kind">\${block.kind}</div>
      <ol>\${list.map(n => \`
        <li>
          <div><strong>\${n.title}</strong> <span class="score">\${n.score.toFixed(3)}</span></div>
          \${n.pairs && n.pairs.length ? \`<div class="pairs">\${n.pairs.map(p => \`<div><span>\${p.a}</span> ↔ <span>\${p.b}</span> (\${p.sim.toFixed(3)})</div>\`).join("")}</div>\` : ""}
        </li>\`).join("")}</ol>
    </div>\`;
  }).join("");
}

fillSelect();
allEl.innerHTML = "<tr><th>Film</th><th>Free elements</th><th>Controlled tags</th></tr>" +
  DATA.films.map(f => \`<tr><td>\${f.title}</td><td>\${f.free_elements.join("; ")}</td><td>\${(f.controlled_tags||[]).join("; ")}</td></tr>\`).join("");

filmSelect.addEventListener("change", render);
filterInput.addEventListener("input", () => {
  const prev = filmSelect.value;
  fillSelect(filterInput.value);
  if (![...filmSelect.options].some(o => o.value === prev) && filmSelect.options.length) {
    filmSelect.selectedIndex = 0;
  } else if (prev) filmSelect.value = prev;
  render();
});
render();
</script>
</body>
</html>`;
}

function writeProductNotes(films, neighborsByApproach) {
  const focusTitles = [
    "Flow",
    "Robot Dreams",
    "Wolf Children",
    "Corpse Bride",
    "The Colors Within",
    "American Pop",
    "The Summit of the Gods",
    "Mary and Max",
    "My Life as a Courgette",
    "Padak",
    "Ernest & Celestine",
    "Anomalisa",
    "Song of the Sea",
    "Belle",
    "I Lost My Body",
  ];

  const lines = [];
  lines.push("# Plot Similarity experiment — product notes");
  lines.push("");
  lines.push("Offline only. Same 50-film sample. Embedding model: `" + EMBED_MODEL + "`.");
  lines.push("");
  lines.push("## Approaches");
  lines.push("- **A Controlled tags**: embed `animated film storytelling: <sorted tags>` from v3 dry-run tags.");
  lines.push("- **B Film embedding**: embed `animated film plot: <free elements joined>`.");
  lines.push("- **C Element best-match**: embed each free element; symmetric mean of max pairwise matches.");
  lines.push("");
  lines.push("## Focus comparisons (top-5)");
  for (const title of focusTitles) {
    const film = films.find((f) => f.title === title);
    if (!film) continue;
    lines.push("");
    lines.push(`### ${title}`);
    lines.push(`Free: ${film.free_elements.join("; ")}`);
    lines.push(`Controlled: ${(film.controlled_tags || []).join("; ")}`);
    for (const key of ["A", "B", "C"]) {
      const top = neighborsByApproach[key].get(film.id) || [];
      lines.push(
        `- **${key}**: ${top.map((n) => `${n.title} (${n.score.toFixed(3)})`).join("; ")}`
      );
      if (key === "C" && top[0]?.pairs?.length) {
        lines.push(
          `  strongest pairs w/ #1: ${top[0].pairs.map((p) => `${p.a}↔${p.b}`).join("; ")}`
        );
      }
    }
  }

  lines.push("");
  lines.push("## Partial-overlap check (C)");
  lines.push(
    "Look at pairs under C: if top neighbors are driven by one generic bridge (friendship / family loss) while distinctive elements do not match, C is over-crediting single shared lines."
  );
  lines.push("");
  lines.push("Open `index.html` for interactive review.");

  fs.writeFileSync(path.join(OUT_DIR, "PRODUCT_NOTES.md"), lines.join("\n"));
}

async function main() {
  ensureDir(OUT_DIR);

  if (!fs.existsSync(SOURCE_LIST)) {
    throw new Error(`Missing source list: ${SOURCE_LIST}`);
  }
  const source = JSON.parse(fs.readFileSync(SOURCE_LIST, "utf8"));
  const titles = source.films.map((f) => f.title);
  const controlledByTitle = new Map(
    source.films.map((f) => [f.title, f.tags || []])
  );

  console.log(`Sample titles: ${titles.length}`);

  const { data: filmRows, error } = await supabase
    .from("films")
    .select(
      "id, title, year, director, synopsis, what_it_is, storytelling_tags, media_type, catalog_visible"
    )
    .eq("media_type", "animation")
    .eq("catalog_visible", true)
    .in("title", titles);
  if (error) throw error;

  const byTitle = new Map((filmRows || []).map((f) => [f.title, f]));
  const filmsOrdered = [];
  for (const title of titles) {
    const row = byTitle.get(title);
    if (!row) {
      console.warn(`Missing film in catalog: ${title}`);
      continue;
    }
    filmsOrdered.push({
      ...row,
      controlled_tags: controlledByTitle.get(title) || row.storytelling_tags || [],
    });
  }
  console.log(`Resolved films: ${filmsOrdered.length}`);

  const freePath = path.join(OUT_DIR, "free-elements.json");
  /** @type {{ id: string, title: string, year: number|null, controlled_tags: string[], free_elements: string[] }[]} */
  let freeRecords;

  if (skipGenerate && fs.existsSync(freePath)) {
    freeRecords = JSON.parse(fs.readFileSync(freePath, "utf8")).films;
    console.log(`Reused free elements: ${freePath}`);
  } else {
    console.log("Generating free plot elements…");
    freeRecords = await mapPool(filmsOrdered, 5, async (film) => {
      const free_elements = await generateFreeElements(film);
      process.stderr.write(".");
      return {
        id: film.id,
        title: film.title,
        year: film.year,
        controlled_tags: film.controlled_tags,
        free_elements,
      };
    });
    process.stderr.write("\n");
    fs.writeFileSync(
      freePath,
      JSON.stringify(
        { generated_at: new Date().toISOString(), model: TAG_MODEL, films: freeRecords },
        null,
        2
      )
    );
  }

  const filmsById = new Map(freeRecords.map((f) => [f.id, f]));

  // --- Embeddings ---
  console.log(`Embedding with ${EMBED_MODEL}…`);
  const controlledTexts = freeRecords.map((f) =>
    buildControlledEmbedText(f.controlled_tags)
  );
  const freeFilmTexts = freeRecords.map((f) =>
    buildFreeFilmEmbedText(f.free_elements)
  );

  const flatElements = [];
  const elementIndexRanges = [];
  for (const film of freeRecords) {
    const start = flatElements.length;
    for (const el of film.free_elements) flatElements.push(el);
    elementIndexRanges.push({
      id: film.id,
      start,
      end: flatElements.length,
      elements: film.free_elements,
    });
  }

  const [controlledEmbeds, freeFilmEmbeds, elementEmbeds] = await Promise.all([
    embedBatch(controlledTexts),
    embedBatch(freeFilmTexts),
    embedBatch(flatElements),
  ]);

  const controlledById = new Map();
  const freeFilmById = new Map();
  const elementsById = new Map();
  freeRecords.forEach((film, i) => {
    controlledById.set(film.id, controlledEmbeds[i]);
    freeFilmById.set(film.id, freeFilmEmbeds[i]);
  });
  for (const range of elementIndexRanges) {
    elementsById.set(range.id, {
      elements: range.elements,
      embeds: elementEmbeds.slice(range.start, range.end),
    });
  }

  // --- Pairwise scores ---
  /** @type {Map<string, Map<string, {score:number, pairs?: any}>>} */
  const scoresA = new Map();
  const scoresB = new Map();
  const scoresC = new Map();
  const scoresAJaccard = new Map();

  for (const a of freeRecords) {
    scoresA.set(a.id, new Map());
    scoresB.set(a.id, new Map());
    scoresC.set(a.id, new Map());
    scoresAJaccard.set(a.id, new Map());
  }

  for (let i = 0; i < freeRecords.length; i += 1) {
    for (let j = i + 1; j < freeRecords.length; j += 1) {
      const a = freeRecords[i];
      const b = freeRecords[j];

      const simA = cosineSimilarity(
        controlledById.get(a.id),
        controlledById.get(b.id)
      );
      const simB = cosineSimilarity(
        freeFilmById.get(a.id),
        freeFilmById.get(b.id)
      );
      const matchC = elementBestMatchSimilarity(
        elementsById.get(a.id).elements,
        elementsById.get(a.id).embeds,
        elementsById.get(b.id).elements,
        elementsById.get(b.id).embeds
      );
      const jac = jaccard(a.controlled_tags, b.controlled_tags);

      scoresA.get(a.id).set(b.id, { score: simA });
      scoresA.get(b.id).set(a.id, { score: simA });
      scoresB.get(a.id).set(b.id, { score: simB });
      scoresB.get(b.id).set(a.id, { score: simB });
      scoresC.get(a.id).set(b.id, { score: matchC.score, pairs: matchC.pairs });
      // reverse pairs labels for B→A view
      const reversePairs = matchC.pairs.map((p) => ({
        a: p.b,
        b: p.a,
        sim: p.sim,
      }));
      scoresC.get(b.id).set(a.id, {
        score: matchC.score,
        pairs: reversePairs,
      });
      scoresAJaccard.get(a.id).set(b.id, { score: jac });
      scoresAJaccard.get(b.id).set(a.id, { score: jac });
    }
  }

  const neighborsA = new Map();
  const neighborsB = new Map();
  const neighborsC = new Map();
  const neighborsAJac = new Map();
  for (const film of freeRecords) {
    neighborsA.set(film.id, topNeighbors(film.id, scoresA, filmsById));
    neighborsB.set(film.id, topNeighbors(film.id, scoresB, filmsById));
    neighborsC.set(film.id, topNeighbors(film.id, scoresC, filmsById));
    neighborsAJac.set(film.id, topNeighbors(film.id, scoresAJaccard, filmsById));
  }

  // Generic-bridge audit for C: fraction of top-1 pairs that only match on generic words
  let cTop1GenericBridge = 0;
  for (const film of freeRecords) {
    const top = neighborsC.get(film.id)?.[0];
    if (!top?.pairs?.length) continue;
    const topPair = top.pairs[0];
    const generic =
      [...COMMON_GENERIC].some(
        (g) => topPair.a.includes(g) || topPair.b.includes(g)
      ) ||
      /friendship|loss|belonging|identity|journey|survival|danger|oppression/.test(
        `${topPair.a} ${topPair.b}`
      );
    if (generic) cTop1GenericBridge += 1;
  }

  const resultFilms = freeRecords.map((film) => ({
    id: film.id,
    title: film.title,
    year: film.year,
    free_elements: film.free_elements,
    controlled_tags: film.controlled_tags,
    neighbors: {
      A: neighborsA.get(film.id),
      B: neighborsB.get(film.id),
      C: neighborsC.get(film.id),
      A_jaccard: neighborsAJac.get(film.id),
    },
  }));

  const payload = {
    generated_at: new Date().toISOString(),
    embedding_model: EMBED_MODEL,
    tag_model: TAG_MODEL,
    sample_size: resultFilms.length,
    notes: {
      approach_A:
        "Controlled Plot Tags from v3 dry-run, embedded like production storytelling text",
      approach_B: "Free plot elements joined into one film embedding",
      approach_C: "Per-element embeddings + symmetric best-match mean",
      c_top1_generic_bridge_count: cTop1GenericBridge,
      c_top1_generic_bridge_rate: Number(
        (cTop1GenericBridge / resultFilms.length).toFixed(3)
      ),
    },
    films: resultFilms,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(payload, null, 2)
  );
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), buildHtml(payload));
  writeProductNotes(resultFilms, {
    A: neighborsA,
    B: neighborsB,
    C: neighborsC,
  });

  // Compact markdown table for chat
  console.log("\n## Free plot elements (50)\n");
  for (const [i, film] of freeRecords.entries()) {
    console.log(
      `${i + 1}. **${film.title}**: ${film.free_elements.join("; ")}`
    );
  }

  console.log("\n## Top-5 snapshot (focus films)\n");
  for (const title of [
    "Flow",
    "Robot Dreams",
    "Wolf Children",
    "Corpse Bride",
    "The Colors Within",
    "American Pop",
  ]) {
    const film = resultFilms.find((f) => f.title === title);
    if (!film) continue;
    console.log(`\n### ${title}`);
    for (const key of ["A", "B", "C"]) {
      console.log(
        `${key}: ${film.neighbors[key]
          .map((n) => `${n.title} ${n.score.toFixed(3)}`)
          .join(" · ")}`
      );
    }
  }

  console.log(
    `\nC top-1 driven by likely-generic bridge: ${cTop1GenericBridge}/${resultFilms.length}`
  );
  console.log(`\nWrote:\n  ${path.join(OUT_DIR, "index.html")}\n  ${path.join(OUT_DIR, "results.json")}\n  ${path.join(OUT_DIR, "free-elements.json")}\n  ${path.join(OUT_DIR, "PRODUCT_NOTES.md")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
