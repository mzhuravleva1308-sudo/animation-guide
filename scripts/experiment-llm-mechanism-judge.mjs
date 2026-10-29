#!/usr/bin/env node
/**
 * Offline: LLM-as-a-Judge for story/emotional mechanism similarity.
 *
 * For the same 50 films as Plot Similarity:
 *  1) Build a short mechanism card per film (headline + 2–4 charge lines).
 *  2) Pairwise judge (1225 pairs): shared mechanism, required differences, score 0–5.
 *  3) Derive top-5 neighbors + HTML explorer.
 *
 * Does NOT write production data.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-llm-mechanism-judge.mjs
 *   APP_ENV=hosted node scripts/experiment-llm-mechanism-judge.mjs --skip-cards
 *   APP_ENV=hosted node scripts/experiment-llm-mechanism-judge.mjs --skip-pairs
 *   APP_ENV=hosted node scripts/experiment-llm-mechanism-judge.mjs --concurrency=6
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
const OUT_DIR = path.join(REPO_ROOT, "tmp", "experiment-llm-mechanism-judge");
const PLOT_RESULTS = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-free-plot-similarity",
  "results.json"
);
const CHARGE_20 = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-story-charge-20",
  "story-charge-20.json"
);

const skipCards = process.argv.includes("--skip-cards");
const skipPairs = process.argv.includes("--skip-pairs");
const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = Math.max(
  1,
  Number(concurrencyArg?.slice("--concurrency=".length) ?? 6) || 6
);
const TAG_MODEL = process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini";
const TOP_K = 5;

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
    if (!match) throw new Error(`Could not parse JSON: ${text.slice(0, 240)}`);
    return JSON.parse(match[0]);
  }
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

function pairKey(idA, idB) {
  return idA < idB ? `${idA}__${idB}` : `${idB}__${idA}`;
}

function cardText(card) {
  const lines = (card.charge_lines || []).map((l) => `- ${l}`).join("\n");
  return `${card.title}\n${card.headline}\n${lines}`;
}

const CARD_SYSTEM = `You write a Story Mechanism card for an animation film in a multi-viewer recommendation catalog.

Goal: describe what unfolds that gives the story its charge — mechanisms that could matter to *someone*, not one fixed taste.

Return 1 headline + 2–4 short charge lines.
- Concrete processes (plot and/or emotional), film-specific.
- Not mood-only, not visual, not evaluative praise, not full synopsis.
- Not universal clichés unless made specific.
- Do not invent unsupported events.

JSON only:
{
  "headline": "One sentence central charge.",
  "charge_lines": ["...", "..."],
  "confidence": "high|medium|low"
}`;

const JUDGE_SYSTEM = `You are judging similarity of STORY MECHANISMS between two animated films for a recommendation experiment.

Mechanism = how an emotionally or narratively significant situation develops — the process that could hook a viewer.
NOT mere shared topic (both have friendship / both have loss).
NOT mood similarity. NOT visual similarity.

You MUST:
1) State the strongest shared mechanism IF one truly exists (else null).
2) Always list essential DIFFERENCES (at least one). Beautiful forced parallels are failures — prefer "weak/no shared mechanism".
3) Score similarity 0–5:
   0 none
   1 thin thematic echo only
   2 weak / partial
   3 clear shared mechanism with important differences
   4 strong shared mechanism; differences secondary
   5 near-equivalent mechanism (rare)

Be skeptical. Do not invent reconciliations or motives not in the cards.

JSON only:
{
  "shared_mechanism": "string or null",
  "differences": ["...", "..."],
  "similarity": 0,
  "confidence": "high|medium|low",
  "rationale": "2–4 sentences"
}`;

async function generateCard(film, freeElements) {
  const response = await openai.chat.completions.create({
    model: TAG_MODEL,
    temperature: 0.35,
    messages: [
      { role: "system", content: CARD_SYSTEM },
      {
        role: "user",
        content: `Film: ${film.title} (${film.year ?? "?"})
Director: ${film.director ?? ""}
Synopsis: ${film.synopsis || film.what_it_is || ""}
What it is: ${film.what_it_is || ""}
Free plot elements: ${(freeElements || []).join("; ")}

JSON only.`,
      },
    ],
  });
  const parsed = parseJson(response.choices[0]?.message?.content ?? "");
  return {
    headline: String(parsed.headline || "").trim().replace(/\s+/g, " "),
    charge_lines: (parsed.charge_lines || [])
      .map((s) => String(s).trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 4),
    confidence: ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "medium",
  };
}

async function judgePair(cardA, cardB) {
  const response = await openai.chat.completions.create({
    model: TAG_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: `Compare mechanisms.

FILM A
${cardText(cardA)}

FILM B
${cardText(cardB)}

JSON only.`,
      },
    ],
  });
  const parsed = parseJson(response.choices[0]?.message?.content ?? "");
  let similarity = Number(parsed.similarity);
  if (!Number.isFinite(similarity)) similarity = 0;
  similarity = Math.max(0, Math.min(5, Math.round(similarity)));
  return {
    shared_mechanism:
      parsed.shared_mechanism == null || parsed.shared_mechanism === "null"
        ? null
        : String(parsed.shared_mechanism).trim(),
    differences: Array.isArray(parsed.differences)
      ? parsed.differences.map((d) => String(d).trim()).filter(Boolean)
      : [],
    similarity,
    confidence: ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "medium",
    rationale: String(parsed.rationale || "").trim(),
  };
}

function buildHtml(payload) {
  const dataJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>LLM Mechanism Judge</title>
<style>
  :root{--bg:#0f1218;--panel:#171b24;--line:#2a3140;--text:#e8ecf4;--muted:#9aa3b5;--acc:#e6b35c}
  *{box-sizing:border-box}
  body{margin:0;font-family:"IBM Plex Sans","Segoe UI",sans-serif;background:radial-gradient(1100px 500px at 8% -10%,#1a2438,var(--bg));color:var(--text);line-height:1.45}
  header,main{max-width:1100px;margin:0 auto;padding:24px}
  h1{font-size:1.35rem;margin:0 0 8px}
  .sub{color:var(--muted);max-width:70ch}
  .controls{display:flex;flex-wrap:wrap;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin:16px 0}
  label{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--muted)}
  select{min-width:260px;background:#0d1016;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid var(--line);font-size:.72rem;color:var(--muted);margin-left:6px}
  .score{font-weight:600;color:var(--acc)}
  ol{margin:0;padding-left:18px} li{margin:0 0 12px}
  .pair{font-size:.85rem;color:var(--muted);margin-top:4px}
  .pair strong{color:#c9d0de;font-weight:500}
  .diff{color:#c99} .shared{color:#9c9}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:800px){.cols{grid-template-columns:1fr}}
  ul.charges{margin:8px 0 0;padding-left:18px;color:#c9d0de;font-size:.9rem}
</style>
</head>
<body>
<header>
  <h1>LLM-as-a-Judge · mechanism similarity</h1>
  <p class="sub">Offline pairwise judgments (0–5) with required differences. Not embeddings. Not production.</p>
</header>
<main>
  <div class="controls">
    <label>Film<select id="film"></select></label>
    <label>Open pair detail<select id="pair"></select></label>
  </div>
  <div class="card" id="card"></div>
  <div class="card" id="neighbors"><h3 style="margin-top:0">Top-5 by judge score</h3><ol id="list"></ol></div>
  <div class="card" id="detail" style="display:none"></div>
</main>
<script>
const DATA = ${dataJson};
const filmSel = document.getElementById("film");
const pairSel = document.getElementById("pair");
for (const f of DATA.films) {
  const o = document.createElement("option");
  o.value = f.id; o.textContent = f.title; filmSel.appendChild(o);
}
function render() {
  const f = DATA.films.find(x => x.id === filmSel.value);
  document.getElementById("card").innerHTML = \`
    <h2 style="margin:0 0 6px">\${f.title}</h2>
    <div>\${f.headline}</div>
    <ul class="charges">\${(f.charge_lines||[]).map(l=>"<li>"+l+"</li>").join("")}</ul>\`;
  const list = document.getElementById("list");
  list.innerHTML = "";
  pairSel.innerHTML = '<option value="">— select neighbor —</option>';
  for (const n of f.neighbors || []) {
    const li = document.createElement("li");
    li.innerHTML = \`<div><strong>\${n.title}</strong> <span class="score">\${n.similarity}/5</span>
      <span class="chip">\${n.confidence||""}</span></div>
      <div class="pair shared">shared: \${n.shared_mechanism || "—"}</div>
      <div class="pair diff">diff: \${(n.differences||[]).join(" · ") || "—"}</div>\`;
    list.appendChild(li);
    const o = document.createElement("option");
    o.value = n.id; o.textContent = n.title + " ("+n.similarity+")";
    pairSel.appendChild(o);
  }
  document.getElementById("detail").style.display = "none";
}
function renderPair() {
  const f = DATA.films.find(x => x.id === filmSel.value);
  const otherId = pairSel.value;
  const box = document.getElementById("detail");
  if (!otherId) { box.style.display="none"; return; }
  const n = (f.neighbors||[]).find(x => x.id === otherId);
  const g = DATA.films.find(x => x.id === otherId);
  const full = DATA.pairs[f.id < otherId ? f.id+"__"+otherId : otherId+"__"+f.id];
  box.style.display = "block";
  box.innerHTML = \`
    <h3 style="margin-top:0">Pair detail</h3>
    <div class="cols">
      <div><strong>\${f.title}</strong><div>\${f.headline}</div><ul class="charges">\${(f.charge_lines||[]).map(l=>"<li>"+l+"</li>").join("")}</ul></div>
      <div><strong>\${g.title}</strong><div>\${g.headline}</div><ul class="charges">\${(g.charge_lines||[]).map(l=>"<li>"+l+"</li>").join("")}</ul></div>
    </div>
    <p><span class="score">\${(full||n).similarity}/5</span> · shared: <strong>\${(full||n).shared_mechanism || "—"}</strong></p>
    <p class="diff">Differences: \${((full||n).differences||[]).join(" · ")}</p>
    <p class="pair">\${(full||n).rationale || ""}</p>\`;
}
filmSel.addEventListener("change", render);
pairSel.addEventListener("change", renderPair);
render();
</script>
</body>
</html>`;
}

async function main() {
  ensureDir(OUT_DIR);

  if (!fs.existsSync(PLOT_RESULTS)) {
    throw new Error(`Missing ${PLOT_RESULTS}`);
  }
  const plotResults = JSON.parse(fs.readFileSync(PLOT_RESULTS, "utf8"));
  const freeById = new Map(
    plotResults.films.map((f) => [f.id, f.free_elements || []])
  );
  const titles = plotResults.films.map((f) => f.title);

  const charge20 = fs.existsSync(CHARGE_20)
    ? JSON.parse(fs.readFileSync(CHARGE_20, "utf8"))
    : { films: [] };
  const charge20ByTitle = new Map(
    (charge20.films || []).map((f) => [f.title, f])
  );

  const { data: filmRows, error } = await supabase
    .from("films")
    .select("id, title, year, director, synopsis, what_it_is")
    .eq("media_type", "animation")
    .in("title", titles);
  if (error) throw error;
  const byTitle = new Map((filmRows || []).map((f) => [f.title, f]));

  const cardsPath = path.join(OUT_DIR, "mechanism-cards.json");
  /** @type {any[]} */
  let cards;

  if (skipCards && fs.existsSync(cardsPath)) {
    cards = JSON.parse(fs.readFileSync(cardsPath, "utf8")).films;
    console.log(`Reused cards: ${cards.length}`);
  } else {
    console.log("Building mechanism cards…");
    const ordered = [];
    for (const title of titles) {
      const row = byTitle.get(title);
      if (!row) {
        console.warn(`Missing film: ${title}`);
        continue;
      }
      ordered.push(row);
    }

    cards = await mapPool(ordered, 4, async (film) => {
      const existing = charge20ByTitle.get(film.title);
      if (existing?.headline && existing?.charge_lines?.length) {
        process.stderr.write("c");
        return {
          id: film.id,
          title: film.title,
          year: film.year,
          headline: existing.headline,
          charge_lines: existing.charge_lines,
          confidence: existing.confidence || "medium",
          source: "story-charge-20",
        };
      }
      const generated = await generateCard(film, freeById.get(film.id) || []);
      process.stderr.write(".");
      return {
        id: film.id,
        title: film.title,
        year: film.year,
        ...generated,
        source: "generated",
      };
    });
    process.stderr.write("\n");
    fs.writeFileSync(
      cardsPath,
      JSON.stringify(
        { generated_at: new Date().toISOString(), model: TAG_MODEL, films: cards },
        null,
        2
      )
    );
  }

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const ids = cards.map((c) => c.id);

  /** @type {[string, string][]} */
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs.push([ids[i], ids[j]]);
    }
  }
  console.log(`Pairs to judge: ${pairs.length}`);

  const pairsPath = path.join(OUT_DIR, "pair-judgments.json");
  /** @type {Record<string, any>} */
  let judgments = {};
  if (fs.existsSync(pairsPath)) {
    judgments = JSON.parse(fs.readFileSync(pairsPath, "utf8")).judgments || {};
    console.log(`Loaded checkpoint judgments: ${Object.keys(judgments).length}`);
  }

  if (!skipPairs) {
    const pending = pairs.filter(([a, b]) => !judgments[pairKey(a, b)]);
    console.log(`Pending: ${pending.length} (concurrency=${CONCURRENCY})`);
    let done = 0;
    await mapPool(pending, CONCURRENCY, async ([idA, idB]) => {
      const key = pairKey(idA, idB);
      try {
        const result = await judgePair(cardById.get(idA), cardById.get(idB));
        judgments[key] = {
          id_a: idA < idB ? idA : idB,
          id_b: idA < idB ? idB : idA,
          title_a: cardById.get(idA < idB ? idA : idB).title,
          title_b: cardById.get(idA < idB ? idB : idA).title,
          ...result,
        };
      } catch (err) {
        judgments[key] = {
          id_a: idA < idB ? idA : idB,
          id_b: idA < idB ? idB : idA,
          title_a: cardById.get(idA < idB ? idA : idB).title,
          title_b: cardById.get(idA < idB ? idB : idA).title,
          shared_mechanism: null,
          differences: ["judge_error"],
          similarity: 0,
          confidence: "low",
          rationale: String(err?.message || err),
          error: true,
        };
      }
      done += 1;
      if (done % 25 === 0 || done === pending.length) {
        fs.writeFileSync(
          pairsPath,
          JSON.stringify(
            {
              generated_at: new Date().toISOString(),
              model: TAG_MODEL,
              total_pairs: pairs.length,
              completed: Object.keys(judgments).length,
              judgments,
            },
            null,
            2
          )
        );
        process.stderr.write(`\ncheckpoint ${Object.keys(judgments).length}/${pairs.length}`);
      } else {
        process.stderr.write(".");
      }
    });
    process.stderr.write("\n");
    fs.writeFileSync(
      pairsPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          model: TAG_MODEL,
          total_pairs: pairs.length,
          completed: Object.keys(judgments).length,
          judgments,
        },
        null,
        2
      )
    );
  }

  // Build neighbor lists
  const neighborMap = new Map(ids.map((id) => [id, []]));
  for (const [key, j] of Object.entries(judgments)) {
    if (!j || j.error) continue;
    const a = j.id_a;
    const b = j.id_b;
    neighborMap.get(a).push({
      id: b,
      title: j.title_b,
      similarity: j.similarity,
      shared_mechanism: j.shared_mechanism,
      differences: j.differences,
      confidence: j.confidence,
      rationale: j.rationale,
    });
    neighborMap.get(b).push({
      id: a,
      title: j.title_a,
      similarity: j.similarity,
      shared_mechanism: j.shared_mechanism,
      differences: j.differences,
      confidence: j.confidence,
      rationale: j.rationale,
    });
  }

  const resultFilms = cards.map((c) => {
    const neighbors = (neighborMap.get(c.id) || [])
      .sort(
        (x, y) =>
          y.similarity - x.similarity ||
          String(x.title).localeCompare(String(y.title))
      )
      .slice(0, TOP_K);
    return { ...c, neighbors };
  });

  const focus = [
    "Flow",
    "Robot Dreams",
    "Mary and Max",
    "Wolf Children",
    "The Red Turtle",
    "Ernest & Celestine",
    "Coraline",
    "Anomalisa",
  ];

  const notes = [];
  notes.push("# LLM Mechanism Judge — notes");
  notes.push("");
  notes.push(`Model: ${TAG_MODEL}. Pairs: ${Object.keys(judgments).length}.`);
  notes.push("UI: `comparison.html`");
  notes.push("");
  notes.push("## Focus top-5");
  for (const title of focus) {
    const f = resultFilms.find((x) => x.title === title);
    if (!f) continue;
    notes.push("");
    notes.push(`### ${title}`);
    notes.push(f.headline);
    for (const n of f.neighbors) {
      notes.push(
        `- **${n.similarity}/5** ${n.title} — shared: ${n.shared_mechanism || "—"}`
      );
      if (n.differences?.length) {
        notes.push(`  diff: ${n.differences.join("; ")}`);
      }
    }
  }
  notes.push("");
  notes.push("## How to read");
  notes.push(
    "Prefer scores ≥3 with a crisp shared_mechanism and honest differences. Score 1–2 with only thematic echo should be treated as weak. Watch for eloquent but forced parallels."
  );
  fs.writeFileSync(path.join(OUT_DIR, "PRODUCT_NOTES.md"), notes.join("\n"));

  const payload = {
    generated_at: new Date().toISOString(),
    model: TAG_MODEL,
    sample_size: resultFilms.length,
    pair_count: Object.keys(judgments).length,
    films: resultFilms,
    pairs: judgments,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(payload, null, 2)
  );
  fs.writeFileSync(path.join(OUT_DIR, "comparison.html"), buildHtml(payload));

  console.log("\n## Focus snapshot\n");
  for (const title of ["Flow", "Robot Dreams", "Mary and Max", "Ernest & Celestine"]) {
    const f = resultFilms.find((x) => x.title === title);
    if (!f) continue;
    console.log(`\n### ${title}`);
    for (const n of f.neighbors) {
      console.log(
        `  ${n.similarity}/5 ${n.title} | ${n.shared_mechanism || "—"}`
      );
    }
  }

  console.log(
    `\nWrote:\n  ${OUT_DIR}/comparison.html\n  ${OUT_DIR}/mechanism-cards.json\n  ${OUT_DIR}/pair-judgments.json\n  ${OUT_DIR}/results.json\n  ${OUT_DIR}/PRODUCT_NOTES.md`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
