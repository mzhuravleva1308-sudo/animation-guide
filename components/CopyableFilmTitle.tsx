"use client";

import { useState } from "react";

type CopyableFilmTitleProps = {
  title: string;
};

export default function CopyableFilmTitle({
  title,
}: CopyableFilmTitleProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(title);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="cursor-pointer text-left text-xl font-medium transition-opacity hover:opacity-60"
        title="Click to copy title"
        aria-label={`Copy ${title}`}
      >
        {title}
      </button>

      {copied && (
        <div
          role="status"
          className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          Title copied
        </div>
      )}
    </>
  );
}