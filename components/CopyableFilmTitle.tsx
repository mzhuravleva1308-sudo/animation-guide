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
      }, 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="cursor-copy text-left text-xl font-medium"
      title={copied ? "Copied" : "Click to copy title"}
      aria-label={`Copy ${title}`}
    >
      {copied ? "Copied" : title}
    </button>
  );
}