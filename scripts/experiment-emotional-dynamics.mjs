#!/usr/bin/env node
/**
 * Offline experiment: Emotional Dynamics
 *
 * Generates 2–4 concrete emotional-mechanism sentences per film (same 50 as
 * Plot Similarity experiment), embeds each sentence, compares:
 *   Plot B / Plot C (from prior experiment results)
 *   Emotional C1 — symmetric best-match
 *   Emotional C2 — independent top-2 pairs (no element reused)
 *
 * Does NOT write production data.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-emotional-dynamics.mjs
 *   APP_ENV=hosted node scripts/experiment-emotional-dynamics.mjs --skip-generate
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
const OUT_DIR = path.join(REPO_ROOT, "tmp", "experiment-emotional-dynamics");
const PLOT_RESULTS = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-free-plot-similarity",
  "results.json"
);
const PLOT_FREE = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-free-plot-similarity",
  "free-elements.json"
);

const skipGenerate = process.argv.includes("--skip-generate");
const TOP_K = 5;
const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const TAG_MODEL = process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini";

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

const ED_SYSTEM = `You extract Emotional Dynamics for an animation recommendation experiment (Resonale).

Emotional Dynamics = the mechanism of emotional impact in the story:
how an emotionally significant situation develops, and what makes it potentially affect the viewer.

NOT Mood (melancholic, dreamlike, hopeful).
NOT Plot events as the main content (a boat trip after a flood).
NOT abstract themes (friendship, motherhood, overcoming adversity).
NOT evaluative praise (deeply moving, beautifully nuanced, profound journey).

Write 2–4 items. Each item is ONE concrete English sentence describing a specific emotional mechanism in THIS film.
Prefer: initial situation → tension → development or unresolved state.
Unresolved, static, absurd, or contradictory dynamics are valid — do NOT force a positive transformation arc.
Do NOT invent feelings, reconciliations, or motives not supported by the available film description.
If evidence is thin, fewer items and lower confidence.

Avoid universal clichés unless made film-specific:
finding inner strength, overcoming adversity, discovering oneself, learning to trust, dealing with loss, finding belonging.

Return ONLY JSON:
{
  "emotional_dynamics": [
    { "text": "Full sentence…", "mechanism": "short analyst label", "confidence": "high|medium|low" }
  ],
  "data_limitations": "optional note if synopsis is thin"
}`;

async function generateEmotionalDynamics(film, freeElements) {
  const synopsis = film.synopsis || film.what_it_is || "";
  const response = await openai.chat.completions.create({
    model: TAG_MODEL,
    temperature: 0.35,
    messages: [
      { role: "system", content: ED_SYSTEM },
      {
        role: "user",
        content: `Film: ${film.title} (${film.year ?? "?"})
Director: ${film.director ?? ""}
Synopsis: ${synopsis}
What it is: ${film.what_it_is ?? ""}
The mood sentence (atmosphere only — do NOT copy as Emotional Dynamics): ${film.the_mood ?? ""}
Moods (do NOT copy): ${(film.moods ?? []).join(", ")}
Free plot elements from prior experiment (context only — do NOT copy as Emotional Dynamics): ${(freeElements || []).join("; ")}

Return Emotional Dynamics JSON only.`,
      },
    ],
  });

  const parsed = parseJson(response.choices[0]?.message?.content ?? "");
  const items = (parsed.emotional_dynamics || [])
    .map((row) => ({
      text: String(row.text ?? "")
        .trim()
        .replace(/\s+/g, " "),
      mechanism: String(row.mechanism ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " "),
      confidence: ["high", "medium", "low"].includes(row.confidence)
        ? row.confidence
        : "medium",
    }))
    .filter((row) => row.text.length > 20)
    .slice(0, 4);

  return {
    items,
    data_limitations: parsed.data_limitations
      ? String(parsed.data_limitations).trim()
      : null,
  };
}

/**
 * C1: symmetric best-match mean (same as Plot C).
 */
function emotionalC1(elementsA, embedsA, elementsB, embedsB) {
  if (!embedsA?.length || !embedsB?.length) {
    return { score: 0, pairs: [], mode: "empty" };
  }

  const forward = [];
  let fSum = 0;
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
    fSum += best;
    forward.push({ a: elementsA[i], b: elementsB[bestJ], sim: best, i, j: bestJ });
  }

  const backward = [];
  let bSum = 0;
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
    bSum += best;
    backward.push({ a: elementsA[bestI], b: elementsB[j], sim: best, i: bestI, j });
  }

  const score = (fSum / embedsA.length + bSum / embedsB.length) / 2;
  const pairKey = (p) => `${p.i}|${p.j}`;
  const merged = new Map();
  for (const p of [...forward, ...backward]) {
    const key = pairKey(p);
    const prev = merged.get(key);
    if (!prev || p.sim > prev.sim) merged.set(key, p);
  }
  const pairs = [...merged.values()]
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
    .map(({ a, b, sim }) => ({ a, b, sim }));

  return { score, pairs, mode: "symmetric_best_match" };
}

/**
 * C2: greedy independent top pairs — each element used at most once.
 */
function emotionalC2(elementsA, embedsA, elementsB, embedsB) {
  if (!embedsA?.length || !embedsB?.length) {
    return { score: 0, pairs: [], mode: "empty", single_match_only: false };
  }

  /** @type {{ a: string, b: string, sim: number, i: number, j: number }[]} */
  const candidates = [];
  for (let i = 0; i < embedsA.length; i += 1) {
    for (let j = 0; j < embedsB.length; j += 1) {
      candidates.push({
        a: elementsA[i],
        b: elementsB[j],
        sim: cosineSimilarity(embedsA[i], embedsB[j]),
        i,
        j,
      });
    }
  }
  candidates.sort((x, y) => y.sim - x.sim);

  const usedI = new Set();
  const usedJ = new Set();
  const pairs = [];
  const maxPairs = Math.min(2, embedsA.length, embedsB.length);

  for (const c of candidates) {
    if (pairs.length >= maxPairs) break;
    if (usedI.has(c.i) || usedJ.has(c.j)) continue;
    usedI.add(c.i);
    usedJ.add(c.j);
    pairs.push({ a: c.a, b: c.b, sim: c.sim });
  }

  const single_match_only = pairs.length === 1;
  const score =
    pairs.length === 0
      ? 0
      : pairs.reduce((s, p) => s + p.sim, 0) / pairs.length;

  return {
    score,
    pairs,
    mode: "independent_top2",
    single_match_only,
  };
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
      single_match_only: payload.single_match_only ?? false,
      mode: payload.mode ?? null,
    }));
}

function buildHtml(payload) {
  const dataJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Emotional Dynamics Experiment</title>
<style>
  :root {
    --bg:#0f1218; --panel:#171b24; --line:#2a3140; --text:#e8ecf4; --muted:#9aa3b5;
    --b:#8fd6a2; --c:#7eb8ff; --e1:#e6b35c; --e2:#d48fd6;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:"IBM Plex Sans","Segoe UI",sans-serif;background:radial-gradient(1200px 600px at 10% -10%,#1a2438,var(--bg));color:var(--text);line-height:1.45}
  header,main{max-width:1280px;margin:0 auto;padding:24px}
  h1{font-size:1.4rem;margin:0 0 8px;font-weight:600}
  .sub{color:var(--muted);max-width:75ch;font-size:.95rem}
  .controls{display:flex;flex-wrap:wrap;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin:16px 0}
  label{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--muted)}
  select,input{min-width:240px;background:#0d1016;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
  .ed-list{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
  .ed-item{border-left:3px solid var(--e1);padding:8px 12px;margin:0 0 10px;background:#12161f;border-radius:0 8px 8px 0}
  .ed-item .meta{font-size:.75rem;color:var(--muted);margin-top:4px}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  @media(max-width:1100px){.grid4{grid-template-columns:1fr 1fr}}
  @media(max-width:700px){.grid4{grid-template-columns:1fr}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;min-height:260px}
  .card h3{margin:0 0 2px;font-size:.92rem}
  .card .kind{font-size:.72rem;color:var(--muted);margin-bottom:8px}
  .card.b h3{color:var(--b)} .card.c h3{color:var(--c)} .card.e1 h3{color:var(--e1)} .card.e2 h3{color:var(--e2)}
  ol{margin:0;padding-left:18px} li{margin:0 0 10px}
  .score{font-variant-numeric:tabular-nums;color:var(--muted);font-size:.82rem}
  .pairs{margin-top:4px;font-size:.72rem;color:var(--muted)}
  .pairs div{margin:2px 0}
  .pairs span{color:#c9d0de}
  .compare{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
  @media(max-width:800px){.compare{grid-template-columns:1fr}}
  .badge{display:inline-block;font-size:.7rem;padding:2px 7px;border-radius:999px;border:1px solid var(--line);margin-left:6px;color:var(--muted)}
</style>
</head>
<body>
<header>
  <h1>Emotional Dynamics experiment</h1>
  <p class="sub">Offline. Same 50 films as Plot Similarity. Compare Plot B/C with Emotional C1 (symmetric best-match) and C2 (independent top-2 pairs). Not production.</p>
</header>
<main>
  <div class="controls">
    <label>Film<select id="film"></select></label>
    <label>Compare with<select id="compare"></select></label>
    <label>Filter<input id="filter" type="search" placeholder="Filter films…"/></label>
  </div>
  <div class="ed-list" id="ed"></div>
  <div class="grid4" id="neighbors"></div>
  <div class="compare" id="side"></div>
</main>
<script>
const DATA = ${dataJson};
const filmSelect = document.getElementById("film");
const compareSelect = document.getElementById("compare");
const filterInput = document.getElementById("filter");

function fillSelects(q="") {
  const needle = q.trim().toLowerCase();
  const prevF = filmSelect.value, prevC = compareSelect.value;
  filmSelect.innerHTML = "";
  compareSelect.innerHTML = '<option value="">— none —</option>';
  for (const f of DATA.films) {
    if (needle && !f.title.toLowerCase().includes(needle)) continue;
    const o1 = document.createElement("option");
    o1.value = f.id; o1.textContent = f.title + (f.year ? " ("+f.year+")" : "");
    filmSelect.appendChild(o1);
    const o2 = o1.cloneNode(true);
    compareSelect.appendChild(o2);
  }
  if ([...filmSelect.options].some(o=>o.value===prevF)) filmSelect.value = prevF;
  if ([...compareSelect.options].some(o=>o.value===prevC)) compareSelect.value = prevC;
}

function conf(c){ return c ? \`<span class="badge">\${c}</span>\` : ""; }

function renderEdList(film, el) {
  el.innerHTML = \`<h2 style="margin:0 0 10px;font-size:1rem">\${film.title} — Emotional Dynamics</h2>\` +
    film.emotional_dynamics.map(d => \`
      <div class="ed-item">
        <div>\${d.text}</div>
        <div class="meta">mechanism: \${d.mechanism || "—"} \${conf(d.confidence)}</div>
      </div>\`).join("") +
    (film.data_limitations ? \`<p class="meta" style="color:var(--muted);font-size:.8rem">Data note: \${film.data_limitations}</p>\` : "");
}

function renderNeighbors(film) {
  const blocks = [
    {key:"plot_B", cls:"b", title:"Plot B", kind:"Free plot → one film embedding"},
    {key:"plot_C", cls:"c", title:"Plot C", kind:"Free plot elements · symmetric best-match"},
    {key:"emotional_C1", cls:"e1", title:"Emotional C1", kind:"Emotional Dynamics · symmetric best-match"},
    {key:"emotional_C2", cls:"e2", title:"Emotional C2", kind:"Emotional Dynamics · independent top-2 pairs"},
  ];
  document.getElementById("neighbors").innerHTML = blocks.map(b => {
    const list = film.neighbors[b.key] || [];
    return \`<div class="card \${b.cls}"><h3>\${b.title}</h3><div class="kind">\${b.kind}</div>
      <ol>\${list.map(n => \`
        <li>
          <div><strong>\${n.title}</strong> <span class="score">\${Number(n.score).toFixed(3)}\${n.single_match_only ? " · single pair" : ""}</span></div>
          \${n.pairs?.length ? \`<div class="pairs">\${n.pairs.map(p => \`<div><span>\${p.a}</span><br/>↔ <span>\${p.b}</span> (\${Number(p.sim).toFixed(3)})</div>\`).join("")}</div>\` : ""}
        </li>\`).join("")}</ol></div>\`;
  }).join("");
}

function renderCompare(a, b) {
  const side = document.getElementById("side");
  if (!b) { side.innerHTML = ""; return; }
  const match = (a.neighbors.emotional_C2 || []).find(n => n.id === b.id)
    || (a.neighbors.emotional_C1 || []).find(n => n.id === b.id);
  side.innerHTML = \`
    <div class="ed-list"><h3 style="margin-top:0">\${a.title}</h3>\${a.emotional_dynamics.map(d=>\`<div class="ed-item"><div>\${d.text}</div></div>\`).join("")}</div>
    <div class="ed-list"><h3 style="margin-top:0">\${b.title}</h3>\${b.emotional_dynamics.map(d=>\`<div class="ed-item"><div>\${d.text}</div></div>\`).join("")}
      \${match ? \`<p class="meta" style="color:var(--muted);font-size:.8rem;margin-top:10px">Match score (from A→B lists): \${Number(match.score).toFixed(3)}
      \${match.pairs?.length ? "<br/>"+match.pairs.map(p=>p.a+" ↔ "+p.b+" ("+Number(p.sim).toFixed(3)+")").join("<br/>") : ""}</p>\` : \`<p class="meta" style="color:var(--muted);font-size:.8rem">Not in A's Emotional top-5 — still useful for manual read.</p>\`}
    </div>\`;
}

function render() {
  const film = DATA.films.find(f => f.id === filmSelect.value);
  if (!film) return;
  renderEdList(film, document.getElementById("ed"));
  renderNeighbors(film);
  const other = DATA.films.find(f => f.id === compareSelect.value);
  renderCompare(film, other || null);
}

fillSelects();
filmSelect.addEventListener("change", render);
compareSelect.addEventListener("change", render);
filterInput.addEventListener("input", () => { fillSelects(filterInput.value); render(); });
render();
</script>
</body>
</html>`;
}

async function main() {
  ensureDir(OUT_DIR);

  if (!fs.existsSync(PLOT_RESULTS)) {
    throw new Error(`Missing plot experiment results: ${PLOT_RESULTS}`);
  }

  const plotResults = JSON.parse(fs.readFileSync(PLOT_RESULTS, "utf8"));
  const plotFree = fs.existsSync(PLOT_FREE)
    ? JSON.parse(fs.readFileSync(PLOT_FREE, "utf8"))
    : { films: plotResults.films };

  const freeById = new Map(
    (plotFree.films || plotResults.films).map((f) => [
      f.id,
      f.free_elements || [],
    ])
  );
  const plotNeighborsById = new Map(
    plotResults.films.map((f) => [
      f.id,
      {
        plot_B: f.neighbors?.B || [],
        plot_C: f.neighbors?.C || [],
        title: f.title,
        year: f.year,
        free_elements: f.free_elements || freeById.get(f.id) || [],
        controlled_tags: f.controlled_tags || [],
      },
    ])
  );

  const titles = plotResults.films.map((f) => f.title);
  console.log(`Sample: ${titles.length} films from plot experiment`);

  const { data: filmRows, error } = await supabase
    .from("films")
    .select(
      "id, title, year, director, synopsis, what_it_is, the_mood, moods, storytelling_tags"
    )
    .eq("media_type", "animation")
    .in("title", titles);
  if (error) throw error;

  const byTitle = new Map((filmRows || []).map((f) => [f.title, f]));
  const filmsOrdered = [];
  for (const title of titles) {
    const row = byTitle.get(title);
    if (!row) {
      console.warn(`Missing: ${title}`);
      continue;
    }
    filmsOrdered.push(row);
  }

  const dynamicsPath = path.join(OUT_DIR, "emotional-dynamics.json");
  /** @type {any[]} */
  let dynamicsRecords;

  if (skipGenerate && fs.existsSync(dynamicsPath)) {
    dynamicsRecords = JSON.parse(fs.readFileSync(dynamicsPath, "utf8")).films;
    console.log(`Reused ${dynamicsPath}`);
  } else {
    console.log("Generating Emotional Dynamics…");
    dynamicsRecords = await mapPool(filmsOrdered, 4, async (film) => {
      const free = freeById.get(film.id) || [];
      const { items, data_limitations } = await generateEmotionalDynamics(
        film,
        free
      );
      process.stderr.write(".");
      return {
        id: film.id,
        title: film.title,
        year: film.year,
        source_snapshot: {
          synopsis: film.synopsis || null,
          what_it_is: film.what_it_is || null,
          the_mood: film.the_mood || null,
          moods: film.moods || [],
          free_plot_elements: free,
        },
        emotional_dynamics: items,
        data_limitations,
      };
    });
    process.stderr.write("\n");
    fs.writeFileSync(
      dynamicsPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          model: TAG_MODEL,
          films: dynamicsRecords,
        },
        null,
        2
      )
    );
  }

  // Embeddings
  console.log(`Embedding with ${EMBED_MODEL}…`);
  const flatTexts = [];
  const ranges = [];
  for (const film of dynamicsRecords) {
    const start = flatTexts.length;
    for (const d of film.emotional_dynamics) flatTexts.push(d.text);
    ranges.push({
      id: film.id,
      start,
      end: flatTexts.length,
      texts: film.emotional_dynamics.map((d) => d.text),
    });
  }

  const embeds = await embedBatch(flatTexts);
  const embedCache = {
    model: EMBED_MODEL,
    generated_at: new Date().toISOString(),
    films: ranges.map((r) => ({
      id: r.id,
      texts: r.texts,
      // store embeddings for reproducibility (offline experiment only)
      embeddings: embeds.slice(r.start, r.end),
    })),
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "emotional-embeddings.json"),
    JSON.stringify(embedCache)
  );

  const byId = new Map(
    dynamicsRecords.map((f) => [
      f.id,
      {
        ...f,
        texts: f.emotional_dynamics.map((d) => d.text),
        embeds: embedCache.films.find((e) => e.id === f.id)?.embeddings || [],
      },
    ])
  );

  const scoresC1 = new Map();
  const scoresC2 = new Map();
  for (const f of dynamicsRecords) {
    scoresC1.set(f.id, new Map());
    scoresC2.set(f.id, new Map());
  }

  for (let i = 0; i < dynamicsRecords.length; i += 1) {
    for (let j = i + 1; j < dynamicsRecords.length; j += 1) {
      const a = byId.get(dynamicsRecords[i].id);
      const b = byId.get(dynamicsRecords[j].id);
      const c1 = emotionalC1(a.texts, a.embeds, b.texts, b.embeds);
      const c2 = emotionalC2(a.texts, a.embeds, b.texts, b.embeds);

      scoresC1.get(a.id).set(b.id, c1);
      scoresC1.get(b.id).set(a.id, {
        ...c1,
        pairs: c1.pairs.map((p) => ({ a: p.b, b: p.a, sim: p.sim })),
      });
      scoresC2.get(a.id).set(b.id, c2);
      scoresC2.get(b.id).set(a.id, {
        ...c2,
        pairs: c2.pairs.map((p) => ({ a: p.b, b: p.a, sim: p.sim })),
      });
    }
  }

  const filmsById = new Map(dynamicsRecords.map((f) => [f.id, f]));
  const resultFilms = dynamicsRecords.map((film) => {
    const plot = plotNeighborsById.get(film.id) || {};
    return {
      id: film.id,
      title: film.title,
      year: film.year,
      emotional_dynamics: film.emotional_dynamics,
      data_limitations: film.data_limitations,
      free_plot_elements: plot.free_elements || [],
      controlled_tags: plot.controlled_tags || [],
      neighbors: {
        plot_B: (plot.plot_B || []).map((n) => ({
          id: n.id,
          title: n.title,
          score: n.score,
          pairs: null,
        })),
        plot_C: (plot.plot_C || []).map((n) => ({
          id: n.id,
          title: n.title,
          score: n.score,
          pairs: n.pairs || null,
        })),
        emotional_C1: topNeighbors(film.id, scoresC1, filmsById),
        emotional_C2: topNeighbors(film.id, scoresC2, filmsById),
      },
    };
  });

  const focus = [
    "Flow",
    "Robot Dreams",
    "Mary and Max",
    "Wolf Children",
    "The Red Turtle",
    "Anomalisa",
    "Mad God",
    "Cryptozoo",
    "Unicorn Wars",
    "A Boat in the Garden",
  ];

  const notes = [];
  notes.push("# Emotional Dynamics — product notes");
  notes.push("");
  notes.push("Offline experiment. Same 50 films as Plot Similarity.");
  notes.push(`Model: ${TAG_MODEL}. Embeddings: ${EMBED_MODEL}.`);
  notes.push("UI: `comparison.html`");
  notes.push("");
  notes.push("## 1. Specificity of mechanisms");
  notes.push(
    "Review full sentences in `emotional-dynamics.json` / UI. Good items name a concrete relational or inner process with film context; weak items still sound like ‘dealing with loss’ with light dressing."
  );
  notes.push("");
  notes.push("## 2–4. Focus comparisons (Plot B/C vs Emotional C1/C2)");
  for (const title of focus) {
    const f = resultFilms.find((x) => x.title === title);
    if (!f) continue;
    notes.push("");
    notes.push(`### ${title}`);
    for (const d of f.emotional_dynamics) {
      notes.push(`- (${d.confidence}) ${d.text}`);
    }
    for (const key of ["plot_B", "plot_C", "emotional_C1", "emotional_C2"]) {
      const top = f.neighbors[key] || [];
      notes.push(
        `- **${key}**: ${top.map((n) => `${n.title} (${n.score.toFixed(3)})`).join("; ")}`
      );
      if (key.startsWith("emotional") && top[0]?.pairs?.length) {
        notes.push(
          `  top pairs: ${top[0].pairs.map((p) => `${p.a.slice(0, 60)}… ↔ ${p.b.slice(0, 60)}…`).join(" | ")}`
        );
      }
    }
  }
  notes.push("");
  notes.push("## 5. C1 vs C2");
  notes.push(
    "C1 averages every element’s best match (can inflate via one soft bridge). C2 keeps at most two independent pairs and labels single-pair matches — better for checking false emotional parallels."
  );
  notes.push("");
  notes.push("## 6. Data limits");
  notes.push(
    "Generation used synopsis / what_it_is / mood sentence / free plot elements only. Thin synopses → fewer or lower-confidence dynamics; risk of literary over-interpretation remains."
  );
  notes.push("");
  notes.push("## 7. Continue?");
  notes.push(
    "Human-judge focus films in `comparison.html`. If Emotional neighbors feel more ‘mechanism-true’ than Plot B/C for Flow / Robot Dreams / Mary and Max / Wolf Children / Red Turtle, continue with prompt hardening + C2 gates. Do not ship."
  );

  fs.writeFileSync(path.join(OUT_DIR, "PRODUCT_NOTES.md"), notes.join("\n"));

  const payload = {
    generated_at: new Date().toISOString(),
    embedding_model: EMBED_MODEL,
    tag_model: TAG_MODEL,
    sample_size: resultFilms.length,
    films: resultFilms,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(payload, null, 2)
  );
  fs.writeFileSync(path.join(OUT_DIR, "comparison.html"), buildHtml(payload));

  // Console snapshot
  console.log("\n## Emotional Dynamics (focus)\n");
  for (const title of [
    "Flow",
    "Robot Dreams",
    "Mary and Max",
    "Wolf Children",
    "The Red Turtle",
  ]) {
    const f = resultFilms.find((x) => x.title === title);
    if (!f) continue;
    console.log(`\n### ${title}`);
    for (const d of f.emotional_dynamics) {
      console.log(`- [${d.confidence}] ${d.text}`);
    }
    console.log(
      "Emotional C2:",
      f.neighbors.emotional_C2
        .map((n) => `${n.title} ${n.score.toFixed(3)}`)
        .join(" · ")
    );
    console.log(
      "Plot C:",
      f.neighbors.plot_C.map((n) => `${n.title} ${n.score.toFixed(3)}`).join(" · ")
    );
  }

  console.log(`\nWrote:\n  ${OUT_DIR}/comparison.html\n  ${OUT_DIR}/emotional-dynamics.json\n  ${OUT_DIR}/emotional-embeddings.json\n  ${OUT_DIR}/results.json\n  ${OUT_DIR}/PRODUCT_NOTES.md`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
