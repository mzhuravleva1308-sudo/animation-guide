import type { QuickFilter } from "@/components/QuickFilters";
import type { MediaType } from "@/lib/media-type";
import {
  CATALOG_FILTER_QUERY_PARAM as CATALOG_FILTER_QUERY_PARAM_RAW,
  buildCatalogPath as buildCatalogPathRaw,
  parseCatalogQuickFilter as parseCatalogQuickFilterRaw,
  syncCatalogUrl as syncCatalogUrlRaw,
} from "./catalog-url.mjs";

export const CATALOG_FILTER_QUERY_PARAM =
  CATALOG_FILTER_QUERY_PARAM_RAW as "filter";

export function parseCatalogQuickFilter(
  raw: unknown,
  mediaType?: MediaType
): QuickFilter {
  return parseCatalogQuickFilterRaw(raw, mediaType) as QuickFilter;
}

export function buildCatalogPath(input?: {
  media?: string | null;
  filter?: string | null;
}): string {
  return buildCatalogPathRaw(input);
}

export function syncCatalogUrl(input: {
  media?: string | null;
  filter?: string | null;
}): void {
  syncCatalogUrlRaw(input);
}
