"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Archive } from "lucide-react";
import {
  CATALOG_CONTROL_SIZE_PX,
  catalogCircleControlClass,
} from "@/lib/catalog-control-size";
import { useToast } from "@/components/ToastProvider";

const MAX_NOTE_LENGTH = 280;

type VibeHideButtonProps = {
  filmId: string;
  filmTitle?: string;
  onHidden: (filmId: string, note: string | null) => void;
};

export default function VibeHideButton({
  filmId,
  filmTitle,
  onHidden,
}: VibeHideButtonProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const iconSize = Math.round(CATALOG_CONTROL_SIZE_PX * (18 / 40));

  useEffect(() => {
    if (!open) return;

    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function confirmHide() {
    if (isSaving) return;
    setIsSaving(true);

    const trimmedNote = note.trim().slice(0, MAX_NOTE_LENGTH);

    try {
      const response = await fetch("/api/profile-vibe-hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId,
          hidden: true,
          note: trimmedNote || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not archive film");
      }

      onHidden(filmId, trimmedNote || null);
      setOpen(false);
      setNote("");
      showToast("Hidden from vibe results.", "Find it in Archived.");
    } catch (error) {
      showToast(
        "Couldn’t archive this film.",
        error instanceof Error ? error.message : "Please try again.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="vibe-hide-button"
        onClick={() => setOpen(true)}
        disabled={isSaving}
        title="Hide from vibe results"
        aria-label="Hide from vibe results"
        className={`inline-flex ${catalogCircleControlClass} shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white p-0 text-gray-600 transition hover:bg-gray-50 disabled:opacity-60`}
      >
        <Archive
          size={iconSize}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0"
        />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 sm:items-center"
          data-testid="vibe-hide-dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) {
              setOpen(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
          >
            <h2
              id={titleId}
              className="text-[15px] font-medium text-slate-900"
            >
              Hide from vibe results
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-slate-500">
              {filmTitle
                ? `Optional: why didn’t “${filmTitle}” fit?`
                : "Optional: why didn’t this film fit?"}
            </p>
            <textarea
              ref={textareaRef}
              data-testid="vibe-hide-note"
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              rows={3}
              disabled={isSaving}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Too dark, not magical enough, wrong tone…"
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-400"
            />
            <div className="mt-1 flex justify-end text-[11px] text-slate-400">
              {note.trim().length}/{MAX_NOTE_LENGTH}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                data-testid="vibe-hide-cancel"
                disabled={isSaving}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="vibe-hide-confirm"
                disabled={isSaving}
                onClick={() => void confirmHide()}
                className="rounded-xl bg-[#2f3040] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#1f2030] disabled:opacity-60"
              >
                {isSaving ? "Hiding…" : "Hide"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
