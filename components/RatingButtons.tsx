"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RatingButtonsProps = {
  filmId: string;
  profileSlug?: string;
};

export default function RatingButtons({
  filmId,
  profileSlug = "maria",
}: RatingButtonsProps) {
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

  async function saveRating(nextRating: number) {
    if (!profileId) return;

    setIsSaving(true);
    setRating(nextRating);

    const { error } = await supabase.from("film_ratings").upsert(
      {
        film_id: filmId,
        profile_id: profileId,
        rating: nextRating,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "film_id,profile_id",
      }
    );

    if (error) {
      console.error("Rating save error", error);
    }

    setIsSaving(false);
  }

  return (
    <div style={{ marginTop: "28px" }}>
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