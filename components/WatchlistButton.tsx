"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { persistFilmSave } from "@/lib/film-profile-mutations";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";
import { useToast } from "@/components/ToastProvider";
import {
  CATALOG_CONTROL_SIZE_PX,
  catalogCircleControlClass,
} from "@/lib/catalog-control-size";

type WatchlistButtonProps = {
  filmId: string;
  profileSlug?: string;
  profileId?: string;
  profileToken?: string;
  isSaved?: boolean;
  onSavedChange?: (saved: boolean) => void;
  onAuthRequired?: (action: PendingFilmActionInput) => void;
};

export default function WatchlistButton({
  filmId,
  profileSlug = "maria",
  profileId: profileIdFromProps,
  profileToken,
  isSaved,
  onSavedChange,
  onAuthRequired,
}: WatchlistButtonProps) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isInWatchlist, setIsInWatchlist] = useState(isSaved ?? false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isSaved !== undefined) {
      setIsInWatchlist(isSaved);
    }
  }, [isSaved]);

  useEffect(() => {
    async function loadWatchlistStatus() {
      if (onAuthRequired && !profileIdFromProps) {
        setProfileId(null);
        setIsLoading(false);
        return;
      }

      let resolvedProfileId = profileIdFromProps ?? null;

      if (!resolvedProfileId) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("slug", profileSlug)
          .single();

        if (profileError || !profile) {
          console.error("Profile not found", profileError);
          setIsLoading(false);
          return;
        }

        resolvedProfileId = profile.id;
      }

      setProfileId(resolvedProfileId);

      if (isSaved !== undefined) {
        setIsLoading(false);
        return;
      }

      const { data: existingItem, error: itemError } = await supabase
        .from("profile_film_lists")
        .select("id")
        .eq("film_id", filmId)
        .eq("profile_id", resolvedProfileId)
        .eq("list_type", "to_watch")
        .maybeSingle();

      if (itemError) {
        console.error("Watchlist load error", itemError);
        setIsLoading(false);
        return;
      }

      setIsInWatchlist(Boolean(existingItem));
      setIsLoading(false);
    }

    loadWatchlistStatus();
  }, [filmId, profileSlug, profileIdFromProps, isSaved, onAuthRequired]);

  async function toggleWatchlist() {
    if (isLoading || isSaving) return;

    const previousSaved = isInWatchlist;
    const nextSaved = !previousSaved;

    if (!profileId) {
      if (!onAuthRequired) {
        return;
      }

      setIsInWatchlist(nextSaved);
      onSavedChange?.(nextSaved);
      onAuthRequired({
        type: "save",
        filmId,
        saved: nextSaved,
      });
      return;
    }

    setIsSaving(true);
    setIsInWatchlist(nextSaved);

    if (nextSaved) {
      showToast("Saved for later.", "You can find it in Saved.");
    } else {
      showToast("Removed from Saved.", "");
    }

    let error: { message: string } | null = null;

    try {
      ({ error } = await persistFilmSave({
        profileId,
        filmId,
        saved: nextSaved,
        profileToken,
      }));
    } catch (cause) {
      error = {
        message: cause instanceof Error ? cause.message : "Network error",
      };
    }

    if (error) {
      console.error(nextSaved ? "Watchlist add error" : "Watchlist remove error", error);
      setIsInWatchlist(previousSaved);
      setIsSaving(false);
      showToast(
        "Couldn’t save your changes.",
        "Please try again.",
        "error"
      );
      return;
    }

    onSavedChange?.(nextSaved);
    setIsSaving(false);
  }

  const isDisabled = isLoading || isSaving || (!profileId && !onAuthRequired);
  const iconSize = Math.round(CATALOG_CONTROL_SIZE_PX * (18 / 40));

  return (
    <button
      type="button"
      onClick={toggleWatchlist}
      disabled={isDisabled}
      title={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      className={`inline-flex ${catalogCircleControlClass} shrink-0 items-center justify-center rounded-full border p-0 transition ${
        isInWatchlist
          ? "border-black bg-black text-white"
          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill={isInWatchlist ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}
