#!/usr/bin/env node
/**
 * Weekly film discovery entrypoint (Manager → Researcher → Eligibility → email).
 *
 * Safety:
 *   - Refuses to run unless WEEKLY_FILM_DISCOVERY_ENABLED=1 (or --force-enabled)
 *   - --dry-run never persists or emails
 *   - Does not touch public.films / enrichment / catalog_visible
 *
 * Usage:
 *   WEEKLY_FILM_DISCOVERY_ENABLED=1 APP_ENV=hosted node scripts/run-weekly-film-discovery.mjs --dry-run
 *   WEEKLY_FILM_DISCOVERY_ENABLED=1 APP_ENV=hosted node scripts/run-weekly-film-discovery.mjs --skip-email
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import { CATALOG_ANALYTICS_FILM_FIELDS } from "../lib/load-films-catalog.mjs";
import {
  callDiscoveryChat,
  runWeeklyFilmDiscovery,
} from "../lib/film-discovery-workflow.mjs";
import { sendWeeklyFilmDiscoveryEmail } from "../lib/send-weekly-film-discovery-email.mjs";
import { DISCOVERY_ELIGIBILITY } from "../lib/film-discovery.mjs";
import { curateDiscoveryMedia } from "../lib/film-discovery-media.mjs";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    skipEmail: process.env.WEEKLY_FILM_DISCOVERY_SKIP_EMAIL === "1",
    forceEnabled: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-email") options.skipEmail = true;
    else if (arg === "--force-enabled") options.forceEnabled = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function requireEnabled(forceEnabled) {
  if (forceEnabled) return;
  if (process.env.WEEKLY_FILM_DISCOVERY_ENABLED === "1") return;
  throw new Error(
    "Weekly film discovery is gated. Set WEEKLY_FILM_DISCOVERY_ENABLED=1 after review, or pass --force-enabled for a deliberate local run."
  );
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  requireEnabled(options.forceEnabled);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: catalogFilms, error: catalogError } = await supabase
    .from("films")
    .select(CATALOG_ANALYTICS_FILM_FIELDS)
    .order("id");
  if (catalogError) throw catalogError;

  const { data: existingCandidates, error: candidatesError } = await supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, original_title, year, directors, countries, review_status, normalized_title, normalized_original_title"
    );
  if (candidatesError) throw candidatesError;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey && !options.dryRun) {
    throw new Error("OPENAI_API_KEY is required unless using injected test doubles");
  }

  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

  const report = await runWeeklyFilmDiscovery({
    catalogFilms: catalogFilms ?? [],
    existingCandidates: existingCandidates ?? [],
    dryRun: options.dryRun,
    skipEmail: options.skipEmail || options.dryRun,
    researcherFn: async (prompt) => {
      if (!openai) {
        return { candidates: [] };
      }
      return callDiscoveryChat(openai, {
        system: "You are Researcher for Resonale film discovery. Return JSON only.",
        user: prompt,
      });
    },
    eligibilityLlmFn: async (prompt) => {
      if (!openai) return null;
      const raw = await callDiscoveryChat(openai, {
        system:
          "You are Eligibility reviewer for Resonale. Return JSON only with result PASS or FAIL.",
        user: prompt,
      });
      const result =
        String(raw?.result ?? "").toUpperCase() === "PASS"
          ? DISCOVERY_ELIGIBILITY.pass
          : DISCOVERY_ELIGIBILITY.fail;
      return {
        result,
        reasons: Array.isArray(raw?.reasons) ? raw.reasons.map(String) : [],
        missing: Array.isArray(raw?.missing) ? raw.missing.map(String) : [],
        fix_hints: Array.isArray(raw?.fix_hints)
          ? raw.fix_hints.map(String)
          : [],
      };
    },
    mediaCuratorFn: async (candidate) => {
      const tmdbApiKey = process.env.TMDB_API_KEY;
      if (!tmdbApiKey) {
        return {
          media_status: "media_failed",
          media_notes: "TMDB_API_KEY missing; media curator skipped",
          poster_url: null,
          trailer_url: null,
        };
      }
      return curateDiscoveryMedia(candidate, {
        tmdbApiKey,
        youtubeApiKey: process.env.YOUTUBE_API_KEY,
      });
    },
    persistFn: async (batch, candidates) => {
      const { data: insertedBatch, error: batchError } = await supabase
        .from("film_discovery_batches")
        .upsert(batch, { onConflict: "week_key" })
        .select("id")
        .single();
      if (batchError) throw batchError;

      const rows = candidates.map((row) => ({
        ...row,
        batch_id: insertedBatch.id,
      }));
      if (rows.length === 0) return;

      const { error: insertError } = await supabase
        .from("film_discovery_candidates")
        .insert(rows);
      if (insertError) throw insertError;
    },
    sendEmailFn: async (fullReport) => {
      await sendWeeklyFilmDiscoveryEmail(fullReport);
    },
  });

  console.log(
    JSON.stringify(
      {
        dryRun: report.dryRun,
        week_key: report.batch.week_key,
        status: report.batch.status,
        research_rounds: report.batch.research_rounds,
        passed: report.batch.passed_count,
        failed: report.batch.failed_count,
        incomplete: report.batch.incomplete,
        email_subject: report.email.subject,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
