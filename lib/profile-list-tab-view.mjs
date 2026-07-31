/**
 * Pure view-state for Saved/Watched list tabs.
 * Keeps loading and empty as separate states — never conflate them.
 *
 * @param {{
 *   loadError?: string | null,
 *   listsReady: boolean,
 *   listLength: number,
 * }} options
 * @returns {"error" | "loading" | "empty" | "list"}
 */
export function resolveProfileListTabView({
  loadError = null,
  listsReady,
  listLength,
}) {
  if (loadError) {
    return "error";
  }

  // Optimistic / pending-applied rows may arrive before listsReady flips true.
  // Prefer showing known films over a loading skeleton.
  if (listLength > 0) {
    return "list";
  }

  if (!listsReady) {
    return "loading";
  }

  return "empty";
}
