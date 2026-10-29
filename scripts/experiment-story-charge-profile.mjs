#!/usr/bin/env node
/**
 * Offline: Story Charge personalized for a profile (default: maria).
 *
 * 1) Reuse mechanism/Story Charge cards + pairwise judgments for the 50-film pool.
 * 2) Generate Story Charge for the profile's high-rated animation likes outside the pool.
 * 3) Judge outside-pool likes × unrated pool candidates.
 * 4) Rank candidates by best charge-match to any like (rating-weighted).
 *
 * Does NOT write production data.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-story-charge-profile.mjs
 *   APP_ENV=hosted node scripts/experiment-story-charge-profile.mjs --profile=maria
 *   APP_ENV=hosted node scripts/experiment-story-charge-profile.mjs --skip-generate
 *   APP_ENV=hosted node scripts/experiment-story-charge-profile.mjs --skip-pairs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { MEDIA_TYPE } from "../lib/media-type.mjs";

await applyAppEnv({ prefer: "hosted" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "experiment-story-charge-profile");
const MECH_CARDS = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-llm-mechanism-judge",
  "mechanism-cards.json"
);
const MECH_PAIRS = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-llm-mechanism-judge",
  "pair-judgments.json"
);
const PLOT_RESULTS = path.join(
  REPO_ROOT,
  "tmp",
  "experiment-free-plot-similarity",
  "results.json"
);

const PROFILE_SLUG =
  process.argv.find((a) => a.startsWith("--profile="))?.slice("--profile=".length) ??
  "maria";
const skipGenerate = process.argv.includes("--skip-generate");
const skipPairs = process.argv.includes("--skip-pairs");
const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = Math.max(
  1,
  Number(concurrencyArg?.slice("--concurrency=".length) ?? 8) || 8
);
const TAG_MODEL = process.env.OPENAI_TAG_MODEL ?? "gpt-4o-mini";
const LIKE_MIN = 7;
const TOP_N = 20;

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

function ratingWeight(rating) {
  if (rating >= 10) return 1;
  if (rating >= 9) return 0.9;
  if (rating >= 8) return 0.75;
  if (rating >= 7) return 0.55;
  return 0;
}

const CARD_SYSTEM = `You write a Story Charge card for an animation film in a multi-viewer recommendation catalog.

Story Charge = what unfolds that gives the story its hook — the process that could matter to *someone*, not one fixed taste.

Return 1 headline + 2–4 short charge lines.
- Concrete processes (plot and/or emotional), film-specific.
- Prefer cause→effect feel over static themes.
- Not mood-only, not visual craft, not evaluative praise, not a full synopsis.
- Not universal clichés unless made film-specific.
- Do not invent unsupported events.

JSON only:
{
  "headline": "One sentence central charge.",
  "charge_lines": ["...", "..."],
  "confidence": "high|medium|low"
}`;

const JUDGE_SYSTEM = `You are judging similarity of STORY CHARGE between two animated films for a personalized recommendation experiment.

Story Charge = how an emotionally or narratively significant situation develops — the process that could hook a viewer.
NOT mere shared topic (both have friendship / both have loss).
NOT mood similarity. NOT visual similarity.

You MUST:
1) State the strongest shared charge IF one truly exists (else null).
2) Always list essential DIFFERENCES (at least one). Prefer "weak/no shared charge" over forced parallels.
3) Score similarity 0–5:
   0 none
   1 thin thematic echo only
   2 weak / partial
   3 clear shared charge with important differences
   4 strong shared charge; differences secondary
   5 near-equivalent charge (rare)

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
Free plot elements: ${(freeElements || []).join("; ") || "—"}

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
        content: `Compare Story Charge.

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
<title>Story Charge · ${payload.profile}</title>
<style>
  :root{--bg:#10131a;--panel:#171c26;--line:#2a3140;--text:#e8ecf4;--muted:#9aa3b5;--acc:#e6b35c;--ok:#7dcea0}
  *{box-sizing:border-box}
  body{margin:0;font-family:"IBM Plex Sans","Segoe UI",sans-serif;background:radial-gradient(1000px 480px at 10% -10%,#1a2740,var(--bg));color:var(--text);line-height:1.45}
  header,main{max-width:1080px;margin:0 auto;padding:24px}
  h1{font-size:1.4rem;margin:0 0 8px}
  .sub{color:var(--muted);max-width:72ch}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin:14px 0}
  .score{font-weight:650;color:var(--acc)}
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid var(--line);font-size:.72rem;color:var(--muted);margin-left:6px}
  .via{color:var(--ok);font-size:.9rem}
  .diff{color:#c99;font-size:.88rem}
  .shared{color:#9c9;font-size:.88rem}
  ol{margin:0;padding-left:20px} li{margin:0 0 16px}
  ul.charges{margin:6px 0 0;padding-left:18px;color:#c9d0de;font-size:.9rem}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:800px){.grid{grid-template-columns:1fr}}
  select{min-width:280px;background:#0d1016;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:6px}
  label{font-size:.78rem;color:var(--muted)}
  .anchor{border-left:3px solid var(--acc);padding-left:10px;margin:8px 0}
</style>
</head>
<body>
<header>
  <h1>Story Charge · profile <span style="color:var(--acc)">${payload.profile}</span></h1>
  <p class="sub">Offline. Candidates ranked by best Story Charge match to your likes (≥${LIKE_MIN}), weighted by rating. Not production ranking.</p>
</header>
<main>
  <div class="card">
    <h3 style="margin-top:0">Your charge anchors (${payload.anchors.length})</h3>
    <div class="grid" id="anchors"></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0">Top recommendations by Story Charge</h3>
    <ol id="recs"></ol>
  </div>
  <div class="card">
    <label>Inspect candidate
      <select id="pick"></select>
    </label>
    <div id="detail" style="margin-top:14px"></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0">Low-rated pool films (sanity)</h3>
    <ol id="low"></ol>
  </div>
</main>
<script>
const DATA = ${dataJson};
const anchorsEl = document.getElementById("anchors");
for (const a of DATA.anchors) {
  const div = document.createElement("div");
  div.className = "anchor";
  div.innerHTML = \`<strong>\${a.title}</strong> <span class="chip">\${a.rating}/10</span><span class="chip">\${a.in_pool ? "pool" : "extra"}</span>
    <div>\${a.headline||""}</div>
    <ul class="charges">\${(a.charge_lines||[]).map(l=>"<li>"+l+"</li>").join("")}</ul>\`;
  anchorsEl.appendChild(div);
}
const recs = document.getElementById("recs");
const pick = document.getElementById("pick");
for (const r of DATA.recommendations) {
  const li = document.createElement("li");
  li.innerHTML = \`<div><strong>\${r.rank}. \${r.title}</strong> <span class="score">\${r.similarity}/5</span>
    <span class="chip">pull \${r.pull.toFixed(2)}</span></div>
    <div class="via">via \${r.via_title} (\${r.via_rating}/10)</div>
    <div class="shared">shared: \${r.shared_mechanism || "—"}</div>
    <div class="diff">diff: \${(r.differences||[]).join(" · ") || "—"}</div>\`;
  recs.appendChild(li);
  const o = document.createElement("option");
  o.value = r.id; o.textContent = r.rank + ". " + r.title;
  pick.appendChild(o);
}
const low = document.getElementById("low");
for (const r of DATA.low_rated_checks || []) {
  const li = document.createElement("li");
  li.innerHTML = \`<strong>\${r.title}</strong> your rating \${r.your_rating}/10 · best charge match <span class="score">\${r.similarity}/5</span> via \${r.via_title}\`;
  low.appendChild(li);
}
function show() {
  const r = DATA.recommendations.find(x => x.id === pick.value) || DATA.recommendations[0];
  if (!r) return;
  const card = DATA.cards[r.id];
  const via = DATA.cards[r.via_id];
  document.getElementById("detail").innerHTML = \`
    <div class="grid">
      <div><strong>Candidate · \${r.title}</strong><div>\${card?.headline||""}</div>
        <ul class="charges">\${(card?.charge_lines||[]).map(l=>"<li>"+l+"</li>").join("")}</ul></div>
      <div><strong>Via like · \${r.via_title} (\${r.via_rating})</strong><div>\${via?.headline||""}</div>
        <ul class="charges">\${(via?.charge_lines||[]).map(l=>"<li>"+l+"</li>").join("")}</ul></div>
    </div>
    <p><span class="score">\${r.similarity}/5</span> · pull \${r.pull.toFixed(2)}</p>
    <p class="shared">Shared: \${r.shared_mechanism || "—"}</p>
    <p class="diff">Differences: \${(r.differences||[]).join(" · ")}</p>
    <p style="color:var(--muted)">\${r.rationale||""}</p>\`;
}
pick.addEventListener("change", show);
show();
</script>
</body>
</html>`;
}

async function main() {
  ensureDir(OUT_DIR);

  if (!fs.existsSync(MECH_CARDS) || !fs.existsSync(MECH_PAIRS)) {
    throw new Error(
      "Missing mechanism judge artifacts. Run experiment-llm-mechanism-judge.mjs first."
    );
  }

  const mechCards = JSON.parse(fs.readFileSync(MECH_CARDS, "utf8")).films;
  const mechPairs = JSON.parse(fs.readFileSync(MECH_PAIRS, "utf8")).judgments || {};
  const freeById = new Map();
  if (fs.existsSync(PLOT_RESULTS)) {
    const plot = JSON.parse(fs.readFileSync(PLOT_RESULTS, "utf8"));
    for (const f of plot.films || []) {
      freeById.set(f.id, f.free_elements || []);
    }
  }

  const cardById = new Map(mechCards.map((c) => [c.id, { ...c, source: c.source || "pool" }]));
  const poolIds = new Set(mechCards.map((c) => c.id));

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, slug")
    .eq("slug", PROFILE_SLUG)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error(`Profile not found: ${PROFILE_SLUG}`);

  const [{ data: ratings }, { data: films }] = await Promise.all([
    supabase
      .from("film_ratings")
      .select("film_id, rating")
      .eq("profile_id", profile.id),
    supabase
      .from("films")
      .select(
        "id, title, year, director, synopsis, what_it_is, media_type, catalog_visible"
      )
      .eq("media_type", MEDIA_TYPE.animation)
      .eq("catalog_visible", true),
  ]);
  if (!films?.length) throw new Error("No animation films loaded");

  const filmById = new Map(films.map((f) => [f.id, f]));
  const ratingById = new Map(
    (ratings ?? []).map((r) => [r.film_id, Number(r.rating)])
  );

  const rated = [...ratingById.entries()]
    .map(([id, rating]) => {
      const film = filmById.get(id);
      if (!film || !Number.isFinite(rating)) return null;
      return { ...film, rating };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.rating - a.rating || String(a.title).localeCompare(String(b.title))
    );

  const anchorsAll = rated.filter((f) => f.rating >= LIKE_MIN);
  const anchorsInPool = anchorsAll.filter((f) => poolIds.has(f.id));
  const anchorsOutPool = anchorsAll.filter((f) => !poolIds.has(f.id));
  const ratedIds = new Set(rated.map((f) => f.id));
  const candidates = mechCards.filter((c) => !ratedIds.has(c.id));
  const lowRatedInPool = rated.filter(
    (f) => poolIds.has(f.id) && f.rating < LIKE_MIN
  );

  console.log(`Profile: ${profile.slug}`);
  console.log(`Anchors ≥${LIKE_MIN}: ${anchorsAll.length} (in pool ${anchorsInPool.length}, outside ${anchorsOutPool.length})`);
  console.log(`Candidates (unrated in pool): ${candidates.length}`);
  console.log(`Low-rated in pool (sanity): ${lowRatedInPool.length}`);

  // --- Generate Story Charge for outside-pool likes ---
  const extraCardsPath = path.join(OUT_DIR, "extra-like-cards.json");
  /** @type {any[]} */
  let extraCards = [];
  if (skipGenerate && fs.existsSync(extraCardsPath)) {
    extraCards = JSON.parse(fs.readFileSync(extraCardsPath, "utf8")).films || [];
    console.log(`Reused extra like cards: ${extraCards.length}`);
  } else {
    console.log(`Generating Story Charge for ${anchorsOutPool.length} outside-pool likes…`);
    extraCards = await mapPool(anchorsOutPool, 4, async (film) => {
      const generated = await generateCard(film, freeById.get(film.id) || []);
      process.stderr.write(".");
      return {
        id: film.id,
        title: film.title,
        year: film.year,
        ...generated,
        source: "extra-like",
      };
    });
    process.stderr.write("\n");
    fs.writeFileSync(
      extraCardsPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          model: TAG_MODEL,
          profile: profile.slug,
          films: extraCards,
        },
        null,
        2
      )
    );
  }
  for (const c of extraCards) cardById.set(c.id, c);

  // --- Judgments: reuse pool pairs + new like×candidate pairs ---
  /** @type {Record<string, any>} */
  const judgments = { ...mechPairs };
  const extraPairsPath = path.join(OUT_DIR, "extra-pair-judgments.json");
  if (fs.existsSync(extraPairsPath)) {
    const saved = JSON.parse(fs.readFileSync(extraPairsPath, "utf8")).judgments || {};
    Object.assign(judgments, saved);
    console.log(`Loaded extra pair checkpoint: ${Object.keys(saved).length}`);
  }

  const extraAnchors = extraCards.map((c) => c.id);
  /** @type {[string, string][]} */
  const neededPairs = [];
  for (const likeId of extraAnchors) {
    for (const cand of candidates) {
      const key = pairKey(likeId, cand.id);
      if (!judgments[key]) neededPairs.push([likeId, cand.id]);
    }
  }
  // Also ensure in-pool anchor×candidate judgments exist (should from mech)
  let missingInPool = 0;
  for (const a of anchorsInPool) {
    for (const cand of candidates) {
      if (!judgments[pairKey(a.id, cand.id)]) missingInPool += 1;
    }
  }
  console.log(`Extra pairs to judge: ${neededPairs.length}; missing in-pool pairs: ${missingInPool}`);

  if (!skipPairs && neededPairs.length) {
    console.log(`Judging ${neededPairs.length} pairs (concurrency=${CONCURRENCY})…`);
    /** @type {Record<string, any>} */
    const extraOnly = fs.existsSync(extraPairsPath)
      ? JSON.parse(fs.readFileSync(extraPairsPath, "utf8")).judgments || {}
      : {};
    let done = 0;
    await mapPool(neededPairs, CONCURRENCY, async ([idA, idB]) => {
      const key = pairKey(idA, idB);
      try {
        const result = await judgePair(cardById.get(idA), cardById.get(idB));
        const row = {
          id_a: idA < idB ? idA : idB,
          id_b: idA < idB ? idB : idA,
          title_a: cardById.get(idA < idB ? idA : idB).title,
          title_b: cardById.get(idA < idB ? idB : idA).title,
          ...result,
          source: "extra-like-pair",
        };
        judgments[key] = row;
        extraOnly[key] = row;
      } catch (err) {
        const row = {
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
          source: "extra-like-pair",
        };
        judgments[key] = row;
        extraOnly[key] = row;
      }
      done += 1;
      if (done % 20 === 0 || done === neededPairs.length) {
        fs.writeFileSync(
          extraPairsPath,
          JSON.stringify(
            {
              generated_at: new Date().toISOString(),
              model: TAG_MODEL,
              completed: Object.keys(extraOnly).length,
              judgments: extraOnly,
            },
            null,
            2
          )
        );
        process.stderr.write(`\ncheckpoint ${done}/${neededPairs.length}`);
      } else {
        process.stderr.write(".");
      }
    });
    process.stderr.write("\n");
  }

  const anchorMeta = anchorsAll.map((a) => ({
    id: a.id,
    title: a.title,
    year: a.year,
    rating: a.rating,
    weight: ratingWeight(a.rating),
    in_pool: poolIds.has(a.id),
    headline: cardById.get(a.id)?.headline || null,
    charge_lines: cardById.get(a.id)?.charge_lines || [],
    confidence: cardById.get(a.id)?.confidence || null,
  }));

  function bestPull(candidateId) {
    let best = {
      similarity: 0,
      pull: 0,
      via_id: null,
      via_title: null,
      via_rating: null,
      shared_mechanism: null,
      differences: [],
      confidence: null,
      rationale: null,
    };
    for (const a of anchorsAll) {
      const w = ratingWeight(a.rating);
      if (w <= 0) continue;
      if (!cardById.has(a.id)) continue;
      const j = judgments[pairKey(a.id, candidateId)];
      if (!j || j.error) continue;
      const sim = Number(j.similarity) || 0;
      const pull = (sim / 5) * w;
      if (
        pull > best.pull ||
        (pull === best.pull && sim > best.similarity)
      ) {
        const viaIsA = j.id_a === a.id || j.title_a === a.title;
        best = {
          similarity: sim,
          pull,
          via_id: a.id,
          via_title: a.title,
          via_rating: a.rating,
          shared_mechanism: j.shared_mechanism,
          differences: j.differences || [],
          confidence: j.confidence,
          rationale: j.rationale,
          via_is_a: viaIsA,
        };
      }
    }
    return best;
  }

  const scored = candidates
    .map((c) => {
      const best = bestPull(c.id);
      return {
        id: c.id,
        title: c.title,
        year: c.year,
        headline: c.headline,
        charge_lines: c.charge_lines,
        ...best,
      };
    })
    .sort(
      (a, b) =>
        b.pull - a.pull ||
        b.similarity - a.similarity ||
        String(a.title).localeCompare(String(b.title))
    );

  const recommendations = scored.slice(0, TOP_N).map((r, i) => ({
    rank: i + 1,
    ...r,
  }));

  const lowChecks = lowRatedInPool.map((f) => {
    const best = bestPull(f.id);
    return {
      id: f.id,
      title: f.title,
      your_rating: f.rating,
      ...best,
    };
  });

  const cardsObj = {};
  for (const [id, c] of cardById) {
    if (
      anchorsAll.some((a) => a.id === id) ||
      recommendations.some((r) => r.id === id) ||
      lowChecks.some((r) => r.id === id)
    ) {
      cardsObj[id] = {
        id: c.id,
        title: c.title,
        year: c.year,
        headline: c.headline,
        charge_lines: c.charge_lines,
        confidence: c.confidence,
        source: c.source,
      };
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    model: TAG_MODEL,
    profile: profile.slug,
    like_min: LIKE_MIN,
    pool_size: mechCards.length,
    anchors: anchorMeta,
    recommendations,
    low_rated_checks: lowChecks,
    all_scored: scored,
    cards: cardsObj,
  };

  fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "comparison.html"), buildHtml(payload));

  const notes = [];
  notes.push(`# Story Charge · ${profile.slug}`);
  notes.push("");
  notes.push("Offline personalized ranking by Story Charge match to likes. Not production.");
  notes.push("");
  notes.push(`Anchors ≥${LIKE_MIN}: ${anchorsAll.length} (pool ${anchorsInPool.length} + extra ${anchorsOutPool.length}).`);
  notes.push(`Candidates scored: ${scored.length}.`);
  notes.push("");
  notes.push("## Top 15");
  for (const r of recommendations.slice(0, 15)) {
    notes.push(
      `${r.rank}. **${r.title}** — ${r.similarity}/5 via **${r.via_title}** (${r.via_rating}) · pull ${r.pull.toFixed(2)}`
    );
    notes.push(`   shared: ${r.shared_mechanism || "—"}`);
  }
  notes.push("");
  notes.push("## Low-rated sanity");
  for (const r of lowChecks) {
    notes.push(
      `- ${r.title} (you: ${r.your_rating}) → best ${r.similarity}/5 via ${r.via_title}`
    );
  }
  fs.writeFileSync(path.join(OUT_DIR, "PRODUCT_NOTES.md"), notes.join("\n"));

  console.log("\n## Top 15 for", profile.slug, "\n");
  for (const r of recommendations.slice(0, 15)) {
    console.log(
      `${String(r.rank).padStart(2)}. ${r.title}  ${r.similarity}/5  via ${r.via_title}(${r.via_rating})  pull=${r.pull.toFixed(2)}`
    );
    console.log(`    shared: ${r.shared_mechanism || "—"}`);
  }
  console.log("\n## Low-rated sanity\n");
  for (const r of lowChecks) {
    console.log(
      `  ${r.title} (you ${r.your_rating}) → ${r.similarity}/5 via ${r.via_title}`
    );
  }
  console.log(
    `\nWrote:\n  ${OUT_DIR}/comparison.html\n  ${OUT_DIR}/results.json\n  ${OUT_DIR}/PRODUCT_NOTES.md`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
