"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logProfileActivityClient } from "@/lib/log-profile-activity-client";

type WatchlistButtonProps = {
  filmId: string;
  profileSlug?: string;
};

export default function WatchlistButton({
  filmId,
  profileSlug = "maria",
}: WatchlistButtonProps) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadWatchlistStatus() {
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

      setProfileId(profile.id);

      const { data: existingItem, error: itemError } = await supabase
        .from("profile_film_lists")
        .select("id")
        .eq("film_id", filmId)
        .eq("profile_id", profile.id)
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
  }, [filmId, profileSlug]);

  async function toggleWatchlist() {
    if (!profileId || isLoading) return;

    setIsLoading(true);

    if (isInWatchlist) {
      const { error } = await supabase
        .from("profile_film_lists")
        .delete()
        .eq("film_id", filmId)
        .eq("profile_id", profileId)
        .eq("list_type", "to_watch");

      if (error) {
        console.error("Watchlist remove error", error);
        setIsLoading(false);
        return;
      }

      setIsInWatchlist(false);
      setIsLoading(false);
      logProfileActivityClient({
        profileId,
        filmId,
        eventType: "film_unsaved",
      });
      return;
    }

    const { error } = await supabase.from("profile_film_lists").insert({
      film_id: filmId,
      profile_id: profileId,
      list_type: "to_watch",
    });

    if (error) {
      console.error("Watchlist add error", error);
      setIsLoading(false);
      return;
    }

    setIsInWatchlist(true);
    setIsLoading(false);
    logProfileActivityClient({
      profileId,
      filmId,
      eventType: "film_saved",
    });
  }

  return (
    <button
      type="button"
      onClick={toggleWatchlist}
      disabled={isLoading || !profileId}
      title={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
        isInWatchlist
          ? "border-black bg-black text-white"
          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={isInWatchlist ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}