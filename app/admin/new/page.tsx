"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NewFilmPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSaving(true);

    const moods = parseCommaList(formData.get("moods"));
    const themes = parseCommaList(formData.get("themes"));

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
      moods,
      themes,

      dialogue: getOptionalString(formData, "dialogue"),
      emotional_intensity: getOptionalNumber(formData, "emotional_intensity"),
      weirdness: getOptionalNumber(formData, "weirdness"),
      kid_safety: getOptionalString(formData, "kid_safety"),

      why_i_might_like_it: getOptionalString(formData, "why_i_might_like_it"),
      personal_note: getOptionalString(formData, "personal_note"),
      status: getString(formData, "status") || "want_to_watch",
    };

    const { error } = await supabase.from("films").insert(payload);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <button
        onClick={() => router.push("/")}
        className="mb-6 text-sm text-gray-500 hover:text-black"
      >
        ← Back to library
      </button>

      <h1 className="text-3xl font-semibold">Add film</h1>
      <p className="mt-2 text-gray-600">
        Add the first films manually. Later this form will be partly filled by
        semi-auto import.
      </p>

      <form action={handleSubmit} className="mt-8 grid gap-5">
        <SectionTitle>Basic info</SectionTitle>

        <Field name="title" label="Title" required />
        <Field name="original_title" label="Original title" />
        <Field name="director" label="Director" />
        <Field name="year" label="Year" type="number" />
        <Field name="country" label="Country" />
        <Field name="duration_minutes" label="Duration, minutes" type="number" />

        <SectionTitle>Festival</SectionTitle>

        <Field name="festival" label="Festival" placeholder="Kaboom" />
        <Field name="section" label="Section" />

        <SectionTitle>Links</SectionTitle>

        <Field name="source_url" label="Source URL" />
        <Field name="watch_url" label="Watch URL" />
        <Field name="trailer_url" label="Trailer URL" />

        <Select
          name="availability"
          label="Availability"
          options={["unknown", "available", "trailer_only", "festival_only"]}
        />

        <SectionTitle>Description and taste</SectionTitle>

        <Textarea name="synopsis" label="Synopsis" />
        <Field
          name="technique"
          label="Technique"
          placeholder="2D, stop motion, mixed media..."
        />
        <Field
          name="moods"
          label="Moods"
          placeholder="tender, melancholic, weird"
        />
        <Field
          name="themes"
          label="Themes"
          placeholder="memory, childhood, loneliness"
        />

        <Select
          name="dialogue"
          label="Dialogue"
          options={["unknown", "no_dialogue", "has_dialogue", "minimal_dialogue"]}
        />

        <Field
          name="emotional_intensity"
          label="Emotional intensity 1–5"
          type="number"
        />
        <Field name="weirdness" label="Weirdness 1–5" type="number" />

        <Select
          name="kid_safety"
          label="Kid safety"
          options={["unknown", "yes", "maybe", "no"]}
        />

        <Textarea name="why_i_might_like_it" label="Why I might like it" />
        <Textarea name="personal_note" label="Personal note" />

        <Select
          name="status"
          label="Status"
          options={["want_to_watch", "watched", "skipped"]}
        />

        <button
          disabled={saving}
          className="rounded-xl bg-black px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save film"}
        </button>
      </form>
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
  return <h2 className="pt-4 text-lg font-semibold">{children}</h2>;
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="rounded-xl border px-4 py-3 outline-none focus:border-black"
      />
    </label>
  );
}

function Textarea({ name, label }: { name: string; label: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        name={name}
        rows={4}
        className="rounded-xl border px-4 py-3 outline-none focus:border-black"
      />
    </label>
  );
}

function Select({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: string[];
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
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