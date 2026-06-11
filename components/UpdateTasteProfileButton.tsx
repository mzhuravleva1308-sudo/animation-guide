"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UpdateTasteProfileButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function updateTasteProfile() {
    setIsLoading(true);
    setErrorMessage(null);

    const response = await fetch("/api/taste-profile", {
      method: "POST",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setErrorMessage(data?.error ?? "Could not update taste profile");
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={updateTasteProfile}
        disabled={isLoading}
        className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Updating with AI..." : "Update with AI"}
      </button>

      {errorMessage && (
        <p className="mt-2 text-sm text-red-500">{errorMessage}</p>
      )}
    </div>
  );
}