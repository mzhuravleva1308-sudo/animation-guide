import type { Metadata } from "next";
import GuideDocumentPage from "@/components/guides/GuideDocumentPage";
import { ADAM_ELLIOT_MOVIES_GUIDE } from "@/lib/guides/adam-elliot-movies.mjs";
import { buildGuideDocumentMetadata } from "@/lib/guides/guide-document-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = `/guides/${ADAM_ELLIOT_MOVIES_GUIDE.slug}`;
const DESCRIPTION =
  ADAM_ELLIOT_MOVIES_GUIDE.metaDescription ?? ADAM_ELLIOT_MOVIES_GUIDE.intro[0];

export const metadata: Metadata = buildGuideDocumentMetadata({
  h1: ADAM_ELLIOT_MOVIES_GUIDE.documentTitle ?? ADAM_ELLIOT_MOVIES_GUIDE.h1,
  description: DESCRIPTION,
  path: PATH,
  indexable: true,
});

export default function AdamElliotMoviesGuidePage() {
  return (
    <GuideDocumentPage
      guide={ADAM_ELLIOT_MOVIES_GUIDE}
      path={PATH}
      description={DESCRIPTION}
    />
  );
}
