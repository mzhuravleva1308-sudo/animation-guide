"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type FilmDraft = {
  title: string;
  original_title: string | null;
  director: string | null;
  year: number | null;
  country: string | null;
  duration_minutes: number | null;

  festival: string | null;
  section: string | null;

  source_url: string | null;
  watch_url: string | null;
  trailer_url: string | null;
  availability: string;

  synopsis: string | null;
  technique: string | null;
  moods: string[];
  themes: string[];

  dialogue: string;
  emotional_intensity: number | null;
  weirdness: number | null;
  kid_safety: string;

  why_i_might_like_it: string | null;
  personal_note: string | null;
  status: string;
};

export default function ImportFilmPage() {
  const router = useRouter();

  const [inputText, setInputText] = useState("");
  const [draft, setDraft] = useState<FilmDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateDraft() {
    setError(null);
    setGenerating(true);

    try {
      const response = await fetch("/api/import-film", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputText }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to generate draft");
      }

      setDraft(result.draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft(formData: FormData) {
    if (!draft) return;

    setError(null);
    setSaving(true);

    const payload = {
      title: getString(formData, "title"),
      original_title: getOptionalString(formData, "original_title"),
      director: getOptionalString(formData, "director"),
      year: getOptionalNumber(formData, "year"),
      country: getOptionalString(formData, "country"),
      duration_minutes: getOptionalNumber(formData, "duration_minutes"),

      festival: getOptionalString(formData, "festival"),
      section: getOptionalString(formData, "section"),

      source_url: getOptionalString(formData, "source_url"),
      watch_url: getOptionalString(formData, "watch_url"),
      trailer_url: getOptionalString(formData, "trailer_url"),
      availability: getString(formData, "availability") || "unknown",

      synopsis: getOptionalString(formData, "synopsis"),
      technique: getOptionalString(formData, "technique"),
      moods: parseCommaList(formData.get("moods")),
      themes: parseCommaList(formData.get("themes")),

      dialogue: getString(formData, "dialogue") || "unknown",
      emotional_intensity: getOptionalNumber(formData, "emotional_intensity"),
      weirdness: getOptionalNumber(formData, "weirdness"),
      kid_safety: getString(formData, "kid_safety") || "unknown",

      why_i_might_like_it: getOptionalString(formData, "why_i_might_like_it"),
      personal_note: getOptionalString(formData, "personal_note"),
      status: getString(formData, "status") || "want_to_watch",
    };

    const { error } = await supabase.from("films").insert(payload);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <button
        onClick={() => router.push("/")}
        className="mb-6 text-sm text-gray-500 hover:text-black"
      >
        ← Back to library
      </button>

      <header>
        <h1 className="text-3xl font-semibold">Import film</h1>
        <p className="mt-2 text-gray-600">
          Paste text from a festival page, Vimeo, YouTube, or a studio website.
          The app will create a draft film card.
        </p>
      </header>

      <section className="mt-8 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Source text</span>
          <textarea
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            rows={10}
            placeholder="Paste film title, synopsis, director, duration, country, festival section..."
            className="rounded-xl border px-4 py-3 outline-none focus:border-black"
          />
        </label>

        <button
          onClick={generateDraft}
          disabled={generating || !inputText.trim()}
          className="w-fit rounded-xl bg-black px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate draft"}
        </button>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}
      </section>

      {draft && (
        <form action={saveDraft} className="mt-10 grid gap-5">
          <h2 className="text-2xl font-semibold">Review draft</h2>

          <SectionTitle>Basic info</SectionTitle>

          <Field name="title" label="Title" defaultValue={draft.title} required />
          <Field
            name="original_title"
            label="Original title"
            defaultValue={draft.original_title}
          />
          <Field name="director" label="Director" defaultValue={draft.director} />
          <Field name="year" label="Year" type="number" defaultValue={draft.year} />
          <Field name="country" label="Country" defaultValue={draft.country} />
          <Field
            name="duration_minutes"
            label="Duration, minutes"
            type="number"
            defaultValue={draft.duration_minutes}
          />

          <SectionTitle>Festival</SectionTitle>

          <Field name="festival" label="Festival" defaultValue={draft.festival} />
          <Field name="section" label="Section" defaultValue={draft.section} />

          <SectionTitle>Links</SectionTitle>

          <Field name="source_url" label="Source URL" defaultValue={draft.source_url} />
          <Field name="watch_url" label="Watch URL" defaultValue={draft.watch_url} />
          <Field
            name="trailer_url"
            label="Trailer URL"
            defaultValue={draft.trailer_url}
          />

          <Select
            name="availability"
            label="Availability"
            defaultValue={draft.availability}
            options={["unknown", "available", "trailer_only", "festival_only"]}
          />

          <SectionTitle>Description and taste</SectionTitle>

          <Textarea name="synopsis" label="Synopsis" defaultValue={draft.synopsis} />
          <Field name="technique" label="Technique" defaultValue={draft.technique} />
          <Field
            name="moods"
            label="Moods"
            defaultValue={draft.moods.join(", ")}
          />
          <Field
            name="themes"
            label="Themes"
            defaultValue={draft.themes.join(", ")}
          />

          <Select
            name="dialogue"
            label="Dialogue"
            defaultValue={draft.dialogue}
            options={["unknown", "no_dialogue", "has_dialogue", "minimal_dialogue"]}
          />

          <Field
            name="emotional_intensity"
            label="Emotional intensity 1–5"
            type="number"
            defaultValue={draft.emotional_intensity}
          />
          <Field
            name="weirdness"
            label="Weirdness 1–5"
            type="number"
            defaultValue={draft.weirdness}
          />

          <Select
            name="kid_safety"
            label="Kid safety"
            defaultValue={draft.kid_safety}
            options={["unknown", "yes", "maybe", "no"]}
          />

          <Textarea
            name="why_i_might_like_it"
            label="Why I might like it"
            defaultValue={draft.why_i_might_like_it}
          />
          <Textarea
            name="personal_note"
            label="Personal note"
            defaultValue={draft.personal_note}
          />

          <Select
            name="status"
            label="Status"
            defaultValue={draft.status}
            options={["want_to_watch", "watched", "skipped"]}
          />

          <button
            disabled={saving}
            className="rounded-xl bg-black px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save film"}
          </button>
        </form>
      )}
    </main>
  );
}

function parseCommaList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function getOptionalString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value || null;
}

function getOptionalNumber(formData: FormData, key: string) {
  const value = getString(formData, key);
  if (!value) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-4 text-lg font-semibold">{children}</h3>;
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number | null;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="rounded-xl border px-4 py-3 outline-none focus:border-black"
      />
    </label>
  );
}

function Textarea({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        name={name}
        rows={4}
        defaultValue={defaultValue ?? ""}
        className="rounded-xl border px-4 py-3 outline-none focus:border-black"
      />
    </label>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string | null;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? options[0]}
        className="rounded-xl border px-4 py-3 outline-none focus:border-black"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}