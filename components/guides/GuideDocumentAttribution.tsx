import {
  formatGuideEditorialDate,
  GUIDE_DOCUMENT_AUTHOR,
} from "@/lib/guides/guide-document-attribution.mjs";

type GuideDocumentAttributionProps = {
  updatedAt?: string | null;
  authorName?: string | null;
};

/**
 * Visible E-E-A-T byline at the bottom of editorial guide pages.
 */
export default function GuideDocumentAttribution({
  updatedAt = null,
  authorName = GUIDE_DOCUMENT_AUTHOR,
}: GuideDocumentAttributionProps) {
  const dateLabel = updatedAt ? formatGuideEditorialDate(updatedAt) : "";
  if (!authorName && !dateLabel) {
    return null;
  }

  return (
    <p
      data-testid="guide-attribution"
      className="mt-10 font-sans text-sm font-normal leading-[1.5] text-[#7a7b90] antialiased [font-synthesis:none]"
    >
      {authorName ? (
        <span data-testid="guide-attribution-author">By {authorName}</span>
      ) : null}
      {authorName && dateLabel ? (
        <span aria-hidden="true"> · </span>
      ) : null}
      {dateLabel ? (
        <time
          dateTime={updatedAt ?? undefined}
          data-testid="guide-attribution-updated"
        >
          Updated {dateLabel}
        </time>
      ) : null}
    </p>
  );
}
