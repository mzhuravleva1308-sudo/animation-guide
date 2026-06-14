"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logProfileActivityClient } from "@/lib/log-profile-activity-client";
import { useRouter } from "next/navigation";


type RatingButtonsProps = {
  filmId: string;
  profileSlug?: string;
};

export default function RatingButtons({
  filmId,
  profileSlug = "maria",
}: RatingButtonsProps) {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadRating() {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("slug", profileSlug)
        .single();

      if (profileError || !profile) {
        console.error("Profile not found", profileError);
        return;
      }

      setProfileId(profile.id);

      const { data: existingRating, error: ratingError } = await supabase
        .from("film_ratings")
        .select("rating")
        .eq("film_id", filmId)
        .eq("profile_id", profile.id)
        .maybeSingle();

      if (ratingError) {
        console.error("Rating load error", ratingError);
        return;
      }

      setRating(existingRating?.rating ?? null);
    }

    loadRating();
  }, [filmId, profileSlug]);

  async function saveRating(value: number) {
    if (!profileId) {
      return;
    }
  
    setIsSaving(true);
  
    if (rating === value) {
      const { error } = await supabase
        .from("film_ratings")
        .delete()
        .eq("film_id", filmId)
        .eq("profile_id", profileId);
  
      if (!error) {
        setRating(null);
        setIsSaving(false);
        router.refresh();
        logProfileActivityClient({
          profileId,
          filmId,
          eventType: "rating_removed",
        });
        logProfileActivityClient({
          profileId,
          filmId,
          eventType: "film_unwatched",
        });
      } else {
        setIsSaving(false);
      }

      return;
    }
  
    const { error } = await supabase.from("film_ratings").upsert(
      {
        film_id: filmId,
        profile_id: profileId,
        rating: value,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "film_id,profile_id",
      }
    );
  
    if (!error) {
      setRating(value);
      setIsSaving(false);
      router.refresh();
      logProfileActivityClient({
        profileId,
        filmId,
        eventType: "rating_set",
        eventData: { rating: value },
      });
      logProfileActivityClient({
        profileId,
        filmId,
        eventType: "film_watched",
        eventData: { rating: value },
      });
    } else {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <p
        className="text-sm text-gray-500"
        style={{ marginBottom: "12px" }}
      >
        My rating: {rating ? `${rating}/10` : "not rated yet"}
      </p>

      <div
        className="flex flex-wrap"
        style={{ gap: "8px" }}
      >
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => saveRating(value)}
            disabled={isSaving || !profileId}
            style={{
              width: "28px",
              height: "28px",
              minWidth: "28px",
              minHeight: "28px",
              borderRadius: "9999px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: 0,
              cursor: isSaving || !profileId ? "default" : "pointer",
            }}
            className={`border text-sm leading-none ${
              rating === value
                ? "border-black bg-black text-white"
                : "border-gray-300 bg-white text-gray-500"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}