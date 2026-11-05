const SCROLL_HOME_TOP_KEY = "resonale:scroll-home-top";

/** Mark the next catalog home paint to start at the top (guide CTA, etc.). */
export function markScrollHomeToTop(): void {
  try {
    sessionStorage.setItem(SCROLL_HOME_TOP_KEY, "1");
  } catch {
    /* private mode / disabled storage */
  }
}

export function peekScrollHomeToTop(): boolean {
  try {
    return sessionStorage.getItem(SCROLL_HOME_TOP_KEY) === "1";
  } catch {
    return false;
  }
}

/** Returns true once if a home top-scroll was requested, then clears the flag. */
export function consumeScrollHomeToTop(): boolean {
  try {
    if (sessionStorage.getItem(SCROLL_HOME_TOP_KEY) !== "1") {
      return false;
    }
    sessionStorage.removeItem(SCROLL_HOME_TOP_KEY);
    return true;
  } catch {
    return false;
  }
}
