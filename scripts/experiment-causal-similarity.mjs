#!/usr/bin/env node
/**
 * Offline: Causal Similarity — cause→effect story mechanisms.
 *
 * For the same 50 films as Plot / LLM-judge experiments:
 *  1) Extract 1–3 causal chains (A → B → C) + optional relational slots.
 *  2) Pairwise LLM compare chains (not synopsis prose).
 *  3) HTML explorer with top-5 + pair detail.
 *
 * Does NOT write production data.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-causal-similarity.mjs
 *   APP_ENV=hosted node scripts/experiment-causal-similarity.mjs --skip-cards
 *   APP_ENV=hosted node scripts/experiment-causal-similarity.mjs --skip-pairs
 *   APP_ENV=hosted node scripts/experiment-causal-similarity.mjs --concurrency=8
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
const OUT_DIR = path.join(REPO_ROOT, "tmp", "experiment-causal-similarity");
const PLOT_RESULTS = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-free-plot-similarity",
  "results.json"
);
const MECHANISM_CARDS = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-llm-mechanism-judge",
  "mechanism-cards.json"
);

const skipCards = process.argv.includes("--skip-cards");
const skipPairs = process.argv.includes("--skip-pairs");
const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = Math.max(
  1,
  Number(concurrencyArg?.slice("--concurrency=".length) ?? 8) || 8
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

function formatCard(card) {
  const chains = (card.chains || [])
    .map(
      (c, i) =>
        `${i + 1}. ${(c.steps || []).join(" → ")}${c.label ? `  [${c.label}]` : ""}`
    )
    .join("\n");
  const slots = card.slots
    ? `Slots:
- initial_divide: ${card.slots.initial_divide || "—"}
- cause_of_closeness: ${card.slots.cause_of_closeness || "—"}
- what_strengthens: ${card.slots.what_strengthens || "—"}
- outcome: ${card.slots.outcome || "—"}`
    : "";
  return `${card.title}
Chains:
${chains}
${slots}`.trim();
}

const CARD_SYSTEM = `You extract CAUSAL story mechanisms from an animated film for a multi-viewer recommendation experiment.

Focus on cause → effect processes that give the story its charge — why/how something develops, not a list of themes.

CRITICAL: "chains" is REQUIRED and must be non-empty.
Each chain has 3–5 short English steps (cause → effect). Format like:
- Shared danger → mutual dependence → trust
- Social rejection → mutual protection → stronger bond
- Children's growing independence → conflict with maternal protection → letting go
- Involuntary separation → persistent attachment → acceptance without reunion
(Do not copy these; write film-specific steps.)

Also fill optional relational slots when they fit (else null):
- initial_divide
- cause_of_closeness (or main tension cause if not about closeness)
- what_strengthens (or what_escalates)
- outcome

Rules:
- Prefer causal links over static labels.
- Not mood-only. Not visual. Not evaluative praise.
- Not a full synopsis. Do not invent unsupported causes.
- Different films charge differently — do not force every film into “friendship forms”.
- If little causal development: still return at least one short chain; lower confidence.

JSON only:
{
  "chains": [
    { "steps": ["Shared danger", "mutual dependence", "trust"], "label": "short name" }
  ],
  "slots": {
    "initial_divide": "string|null",
    "cause_of_closeness": "string|null",
    "what_strengthens": "string|null",
    "outcome": "string|null"
  },
  "confidence": "high|medium|low"
}`;

const JUDGE_SYSTEM = `You compare CAUSAL MECHANISMS between two animated films.

Compare the cause→effect chains and slots — not atmosphere, not visuals, not bag-of-themes.

You MUST:
1) shared_causal_pattern: the strongest shared cause→effect pattern IF real, else null.
   Prefer patterns like "pressure X produces closeness Y" over vague "friendship develops".
2) differences: always list essential causal differences (at least one).
3) matching_chains: up to 2 pairs of chain labels/steps that justify the score (or empty).
4) similarity 0–5:
   0 none
   1 thematic echo only (same nouns, different causality)
   2 weak / partial causal overlap
   3 clear shared causal pattern with important differences
   4 strong same causal pattern; setting/cast differs
   5 near-equivalent causal engine (rare)

Be skeptical of forced parallels. Prefer null shared + low score over beautiful invention.

JSON only:
{
  "shared_causal_pattern": "string or null",
  "differences": ["...", "..."],
  "matching_chains": [
    { "a": "chain A text", "b": "chain B text", "note": "why they match" }
  ],
  "similarity": 0,
  "confidence": "high|medium|low",
  "rationale": "2–4 sentences"
}`;

async function generateCausalCard(film, extras) {
  const response = await openai.chat.completions.create({
    model: TAG_MODEL,
    temperature: 0.3,
    messages: [
      { role: "system", content: CARD_SYSTEM },
      {
        role: "user",
        content: `Film: ${film.title} (${film.year ?? "?"})
Director: ${film.director ?? ""}
Synopsis: ${film.synopsis || film.what_it_is || ""}
What it is: ${film.what_it_is || ""}
Free plot elements: ${(extras.free_elements || []).join("; ")}
Prior mechanism headline (context only): ${extras.headline || "—"}
Prior charge lines (context only): ${(extras.charge_lines || []).join(" | ")}

JSON only.`,
      },
    ],
  });
  const parsed = parseJson(response.choices[0]?.message?.content ?? "");
  let chains = (parsed.chains || [])
    .map((c) => ({
      steps: (c.steps || [])
        .map((s) => String(s).trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 5),
      label: String(c.label || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " "),
    }))
    .filter((c) => c.steps.length >= 2)
    .slice(0, 3);

  const slotsRaw = parsed.slots || {};
  const normSlot = (v) => {
    if (v == null || v === "null") return null;
    const s = String(v).trim();
    return s.length ? s : null;
  };

  const slots = {
    initial_divide: normSlot(slotsRaw.initial_divide),
    cause_of_closeness: normSlot(slotsRaw.cause_of_closeness),
    what_strengthens: normSlot(slotsRaw.what_strengthens),
    outcome: normSlot(slotsRaw.outcome),
  };

  // Fallback: some model responses fill slots but omit chains.
  if (!chains.length) {
    const fromSlots = [
      slots.initial_divide,
      slots.cause_of_closeness,
      slots.what_strengthens,
      slots.outcome,
    ].filter(Boolean);
    if (fromSlots.length >= 2) {
      chains = [{ steps: fromSlots, label: "primary arc" }];
    }
  }

  return {
    chains,
    slots,
    confidence: ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "medium",
  };
}

async function judgeCausalPair(cardA, cardB) {
  const response = await openai.chat.completions.create({
    model: TAG_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: `Compare causal mechanisms.

FILM A
${formatCard(cardA)}

FILM B
${formatCard(cardB)}

JSON only.`,
      },
    ],
  });
  const parsed = parseJson(response.choices[0]?.message?.content ?? "");
  let similarity = Number(parsed.similarity);
  if (!Number.isFinite(similarity)) similarity = 0;
  similarity = Math.max(0, Math.min(5, Math.round(similarity)));
  return {
    shared_causal_pattern:
      parsed.shared_causal_pattern == null ||
      parsed.shared_causal_pattern === "null"
        ? null
        : String(parsed.shared_causal_pattern).trim(),
    differences: Array.isArray(parsed.differences)
      ? parsed.differences.map((d) => String(d).trim()).filter(Boolean)
      : [],
    matching_chains: Array.isArray(parsed.matching_chains)
      ? parsed.matching_chains
          .map((m) => ({
            a: String(m.a || "").trim(),
            b: String(m.b || "").trim(),
            note: String(m.note || "").trim(),
          }))
          .filter((m) => m.a && m.b)
          .slice(0, 2)
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
<title>Causal Similarity</title>
<style>
  :root{--bg:#0f1218;--panel:#171b24;--line:#2a3140;--text:#e8ecf4;--muted:#9aa3b5;--acc:#8fd6a2}
  *{box-sizing:border-box}
  body{margin:0;font-family:"IBM Plex Sans","Segoe UI",sans-serif;background:radial-gradient(1100px 500px at 10% -10%,#1a2838,var(--bg));color:var(--text);line-height:1.45}
  header,main{max-width:1120px;margin:0 auto;padding:24px}
  h1{font-size:1.35rem;margin:0 0 8px}
  .sub{color:var(--muted);max-width:72ch}
  .controls{display:flex;flex-wrap:wrap;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin:16px 0}
  label{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--muted)}
  select{min-width:260px;background:#0d1016;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
  .chain{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86rem;background:#12161f;border-radius:8px;padding:8px 10px;margin:6px 0;border-left:3px solid var(--acc)}
  .slots{font-size:.85rem;color:#c9d0de;margin-top:10px}
  .slots div{margin:3px 0}
  .score{font-weight:600;color:var(--acc)}
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid var(--line);font-size:.72rem;color:var(--muted);margin-left:6px}
  ol{margin:0;padding-left:18px} li{margin:0 0 12px}
  .pair{font-size:.85rem;color:var(--muted);margin-top:4px}
  .diff{color:#c99} .shared{color:#9c9}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:800px){.cols{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <h1>Causal Similarity</h1>
  <p class="sub">Offline. Cause→effect chains compared by LLM judge (0–5), with required differences. Not production.</p>
</header>
<main>
  <div class="controls">
    <label>Film<select id="film"></select></label>
    <label>Pair detail<select id="pair"></select></label>
  </div>
  <div class="card" id="card"></div>
  <div class="card"><h3 style="margin-top:0">Top-5 causal neighbors</h3><ol id="list"></ol></div>
  <div class="card" id="detail" style="display:none"></div>
</main>
<script>
const DATA = ${dataJson};
const filmSel = document.getElementById("film");
const pairSel = document.getElementById("pair");
for (const f of DATA.films) {
  const o = document.createElement("option");
  o.value = f.id; o.textContent = f.title;
  filmSel.appendChild(o);
}
function chainsHtml(f) {
  return (f.chains||[]).map(c => \`<div class="chain">\${(c.steps||[]).join(" → ")}<div style="color:var(--muted);font-size:.75rem;margin-top:4px">\${c.label||""}</div></div>\`).join("");
}
function slotsHtml(f) {
  const s = f.slots || {};
  return \`<div class="slots">
    <div><b>initial_divide</b>: \${s.initial_divide || "—"}</div>
    <div><b>cause_of_closeness</b>: \${s.cause_of_closeness || "—"}</div>
    <div><b>what_strengthens</b>: \${s.what_strengthens || "—"}</div>
    <div><b>outcome</b>: \${s.outcome || "—"}</div>
  </div>\`;
}
function render() {
  const f = DATA.films.find(x => x.id === filmSel.value);
  document.getElementById("card").innerHTML = \`<h2 style="margin:0 0 8px">\${f.title}</h2>\${chainsHtml(f)}\${slotsHtml(f)}\`;
  const list = document.getElementById("list");
  list.innerHTML = "";
  pairSel.innerHTML = '<option value="">— select neighbor —</option>';
  for (const n of f.neighbors || []) {
    const li = document.createElement("li");
    li.innerHTML = \`<div><strong>\${n.title}</strong> <span class="score">\${n.similarity}/5</span><span class="chip">\${n.confidence||""}</span></div>
      <div class="pair shared">shared causal: \${n.shared_causal_pattern || "—"}</div>
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
  const g = DATA.films.find(x => x.id === otherId);
  const key = f.id < otherId ? f.id+"__"+otherId : otherId+"__"+f.id;
  const full = DATA.pairs[key];
  box.style.display = "block";
  box.innerHTML = \`
    <h3 style="margin-top:0">Pair detail</h3>
    <div class="cols">
      <div><strong>\${f.title}</strong>\${chainsHtml(f)}\${slotsHtml(f)}</div>
      <div><strong>\${g.title}</strong>\${chainsHtml(g)}\${slotsHtml(g)}</div>
    </div>
    <p><span class="score">\${full.similarity}/5</span> · <span class="shared">\${full.shared_causal_pattern || "—"}</span></p>
    <p class="diff">\${(full.differences||[]).join(" · ")}</p>
    \${(full.matching_chains||[]).map(m => \`<div class="chain">\${m.a}<br/>↔ \${m.b}<div style="color:var(--muted);font-size:.75rem;margin-top:4px">\${m.note||""}</div></div>\`).join("")}
    <p class="pair">\${full.rationale || ""}</p>\`;
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

  const mechCards = fs.existsSync(MECHANISM_CARDS)
    ? JSON.parse(fs.readFileSync(MECHANISM_CARDS, "utf8"))
    : { films: [] };
  const mechByTitle = new Map(
    (mechCards.films || []).map((f) => [f.title, f])
  );

  const { data: filmRows, error } = await supabase
    .from("films")
    .select("id, title, year, director, synopsis, what_it_is")
    .eq("media_type", "animation")
    .in("title", titles);
  if (error) throw error;
  const byTitle = new Map((filmRows || []).map((f) => [f.title, f]));

  const cardsPath = path.join(OUT_DIR, "causal-cards.json");
  /** @type {any[]} */
  let cards;

  if (skipCards && fs.existsSync(cardsPath)) {
    cards = JSON.parse(fs.readFileSync(cardsPath, "utf8")).films;
    console.log(`Reused causal cards: ${cards.length}`);
  } else {
    console.log("Extracting causal chains…");
    const ordered = [];
    for (const title of titles) {
      const row = byTitle.get(title);
      if (!row) {
        console.warn(`Missing: ${title}`);
        continue;
      }
      ordered.push(row);
    }

    cards = await mapPool(ordered, 4, async (film) => {
      const mech = mechByTitle.get(film.title);
      const generated = await generateCausalCard(film, {
        free_elements: freeById.get(film.id) || [],
        headline: mech?.headline,
        charge_lines: mech?.charge_lines,
      });
      process.stderr.write(".");
      return {
        id: film.id,
        title: film.title,
        year: film.year,
        ...generated,
      };
    });
    process.stderr.write("\n");
    fs.writeFileSync(
      cardsPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          model: TAG_MODEL,
          films: cards,
        },
        null,
        2
      )
    );
  }

  // Print focus chains early for visibility
  console.log("\n## Sample causal cards\n");
  for (const title of [
    "Flow",
    "Ernest & Celestine",
    "Wolf Children",
    "Robot Dreams",
  ]) {
    const c = cards.find((x) => x.title === title);
    if (!c) continue;
    console.log(`### ${title}`);
    for (const ch of c.chains || []) {
      console.log(`  ${(ch.steps || []).join(" → ")}`);
    }
    if (c.slots) {
      console.log(
        `  slots: ${c.slots.initial_divide || "—"} | ${c.slots.cause_of_closeness || "—"} | ${c.slots.what_strengthens || "—"} | ${c.slots.outcome || "—"}`
      );
    }
  }

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const ids = cards.map((c) => c.id);
  /** @type {[string, string][]} */
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) pairs.push([ids[i], ids[j]]);
  }
  console.log(`\nPairs: ${pairs.length}`);

  const pairsPath = path.join(OUT_DIR, "pair-judgments.json");
  /** @type {Record<string, any>} */
  let judgments = {};
  if (fs.existsSync(pairsPath)) {
    judgments = JSON.parse(fs.readFileSync(pairsPath, "utf8")).judgments || {};
    console.log(`Checkpoint loaded: ${Object.keys(judgments).length}`);
  }

  if (!skipPairs) {
    const pending = pairs.filter(([a, b]) => !judgments[pairKey(a, b)]);
    console.log(`Pending: ${pending.length} (concurrency=${CONCURRENCY})`);
    let done = 0;
    await mapPool(pending, CONCURRENCY, async ([idA, idB]) => {
      const key = pairKey(idA, idB);
      try {
        const result = await judgeCausalPair(
          cardById.get(idA),
          cardById.get(idB)
        );
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
          shared_causal_pattern: null,
          differences: ["judge_error"],
          matching_chains: [],
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
        process.stderr.write(
          `\ncheckpoint ${Object.keys(judgments).length}/${pairs.length}`
        );
      } else {
        process.stderr.write(".");
      }
    });
    process.stderr.write("\n");
  }

  const neighborMap = new Map(ids.map((id) => [id, []]));
  for (const j of Object.values(judgments)) {
    if (!j || j.error) continue;
    neighborMap.get(j.id_a).push({
      id: j.id_b,
      title: j.title_b,
      similarity: j.similarity,
      shared_causal_pattern: j.shared_causal_pattern,
      differences: j.differences,
      matching_chains: j.matching_chains,
      confidence: j.confidence,
      rationale: j.rationale,
    });
    neighborMap.get(j.id_b).push({
      id: j.id_a,
      title: j.title_a,
      similarity: j.similarity,
      shared_causal_pattern: j.shared_causal_pattern,
      differences: j.differences,
      matching_chains: j.matching_chains,
      confidence: j.confidence,
      rationale: j.rationale,
    });
  }

  const resultFilms = cards.map((c) => ({
    ...c,
    neighbors: (neighborMap.get(c.id) || [])
      .sort(
        (a, b) =>
          b.similarity - a.similarity ||
          String(a.title).localeCompare(String(b.title))
      )
      .slice(0, TOP_K),
  }));

  const notes = [];
  notes.push("# Causal Similarity — notes");
  notes.push("");
  notes.push(`Model: ${TAG_MODEL}. Pairs: ${Object.keys(judgments).length}.`);
  notes.push("UI: `comparison.html`");
  notes.push("");
  notes.push("## Focus");
  for (const title of [
    "Flow",
    "Ernest & Celestine",
    "Wolf Children",
    "Robot Dreams",
    "Mary and Max",
    "The Red Turtle",
  ]) {
    const f = resultFilms.find((x) => x.title === title);
    if (!f) continue;
    notes.push("");
    notes.push(`### ${title}`);
    for (const ch of f.chains || []) {
      notes.push(`- ${(ch.steps || []).join(" → ")}`);
    }
    for (const n of f.neighbors || []) {
      notes.push(
        `- **${n.similarity}/5** ${n.title} — ${n.shared_causal_pattern || "—"}`
      );
    }
  }
  notes.push("");
  notes.push(
    "Compare with `tmp/experiment-llm-mechanism-judge/` — causal format should force clearer why/how matches."
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

  console.log("\n## Focus top-5\n");
  for (const title of ["Flow", "Ernest & Celestine", "Robot Dreams", "Wolf Children"]) {
    const f = resultFilms.find((x) => x.title === title);
    if (!f) continue;
    console.log(`\n### ${title}`);
    for (const n of f.neighbors) {
      console.log(
        `  ${n.similarity}/5 ${n.title} | ${n.shared_causal_pattern || "—"}`
      );
    }
  }

  console.log(
    `\nWrote:\n  ${OUT_DIR}/comparison.html\n  ${OUT_DIR}/causal-cards.json\n  ${OUT_DIR}/pair-judgments.json\n  ${OUT_DIR}/results.json\n  ${OUT_DIR}/PRODUCT_NOTES.md`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
