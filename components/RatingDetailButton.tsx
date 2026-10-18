"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { persistFilmRatingDetail } from "@/lib/film-profile-mutations";
import {
  defaultRatingDetailFromOverall,
  type FilmRatingDetail,
} from "@/lib/rating-detail";
import { catalogCircleControlClass } from "@/lib/catalog-control-size";
import { lockBodyScroll } from "@/lib/modal-body-scroll-lock";
import { useToast } from "@/components/ToastProvider";

type RatingDetailButtonProps = {
  filmId: string;
  filmTitle?: string;
  overallRating: number;
  initialDetail?: FilmRatingDetail | null;
  onDetailChange?: (filmId: string, detail: FilmRatingDetail) => void;
};

const AXIS_LABELS = [
  { key: "visual", label: "Visual" },
  { key: "mood", label: "Mood" },
  { key: "plot", label: "Plot" },
] as const;

function AxisSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const inputId = useId();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-medium text-slate-800">
          {label}
        </label>
        <span className="tabular-nums text-[13px] text-slate-500">{value}/10</span>
      </div>
      <input
        id={inputId}
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-slate-800"
      />
    </div>
  );
}

export default function RatingDetailButton({
  filmId,
  filmTitle,
  overallRating,
  initialDetail = null,
  onDetailChange,
}: RatingDetailButtonProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<FilmRatingDetail>(() =>
    initialDetail ?? defaultRatingDetailFromOverall(overallRating)
  );
  const { showToast } = useToast();
  const hasSavedDetail = Boolean(initialDetail);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(initialDetail ?? defaultRatingDetailFromOverall(overallRating));
  }, [open, initialDetail, overallRating]);

  useEffect(() => {
    if (!open) {
      return;
    }
    return lockBodyScroll(window.scrollY);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSaving, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    dialogRef.current?.focus();
  }, [open]);

  async function saveDetail() {
    setIsSaving(true);

    const { error } = await persistFilmRatingDetail({
      filmId,
      detail: draft,
    });

    if (error) {
      console.error("Rating detail save error", error);
      setIsSaving(false);
      showToast("Couldn’t save rating detail.", "Please try again.", "error");
      return;
    }

    onDetailChange?.(filmId, draft);
    setIsSaving(false);
    setOpen(false);
    showToast("Rating detail saved", "Visual, mood, and plot scores updated.");
  }

  return (
    <>
      <button
        type="button"
        data-testid="rating-detail-open"
        title="Rating detail"
        aria-label="Open rating detail"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={`inline-flex ${catalogCircleControlClass} shrink-0 items-center justify-center rounded-full border p-0 transition touch-manipulation ${
          hasSavedDetail
            ? "border-black bg-black text-white"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        <SlidersHorizontal size={13} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
          data-testid="rating-detail-dialog"
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
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg outline-none"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="text-[15px] font-medium text-slate-900">
              Rating detail
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-slate-500">
              {filmTitle
                ? `Break down your ${overallRating}/10 for “${filmTitle}”. Defaults match the overall score.`
                : `Break down your ${overallRating}/10. Defaults match the overall score.`}
            </p>

            <div className="mt-4 space-y-4">
              {AXIS_LABELS.map((axis) => (
                <AxisSlider
                  key={axis.key}
                  label={axis.label}
                  value={draft[axis.key]}
                  disabled={isSaving}
                  onChange={(next) =>
                    setDraft((current) => ({ ...current, [axis.key]: next }))
                  }
                />
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                data-testid="rating-detail-cancel"
                disabled={isSaving}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="rating-detail-save"
                disabled={isSaving}
                onClick={() => void saveDetail()}
                className="rounded-xl bg-[#2f3040] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#1f2030] disabled:opacity-60"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
