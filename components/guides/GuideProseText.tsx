import Link from "next/link";
import type { ReactNode } from "react";

const MARKDOWN_LINK_RE =
  /\[([^\]]+)\]\(((?:\/[^)\s]+)|(?:https?:\/\/[^)\s]+))\)/g;

function isExternalHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/**
 * Guide prose with optional `[label](/path)` or `[label](https://…)` links.
 */
export default function GuideProseText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  MARKDOWN_LINK_RE.lastIndex = 0;
  while ((match = MARKDOWN_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const href = match[2];
    if (isExternalHref(href)) {
      nodes.push(
        <a
          key={`guide-prose-link-${key}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          data-testid="guide-prose-external-link"
          className="underline decoration-[#c5c2d6] underline-offset-2 transition hover:text-[#1A1B2E] hover:decoration-[#1A1B2E]"
        >
          {label}
        </a>
      );
    } else {
      nodes.push(
        <Link
          key={`guide-prose-link-${key}`}
          href={href}
          data-testid="guide-prose-link"
          className="underline decoration-[#c5c2d6] underline-offset-2 transition hover:text-[#1A1B2E] hover:decoration-[#1A1B2E]"
        >
          {label}
        </Link>
      );
    }
    key += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes}</>;
}
